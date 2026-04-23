/**
 * ============================================================================
 * SUBMISSIONS SERVICE — Business Logic for Demo & Contact Form APIs
 * ============================================================================
 * Covers:
 *   - Public: submit demo request, submit contact inquiry (with dedup)
 *   - Sysadmin: list, detail, status update, notes, stats
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { sendEmail } = require('../../utils/emailHelper');
const config = require('../../config/env');
const {
    LOG,
    ERROR_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

// ============================================================================
// STATUS TRANSITION MAPS — enforce valid workflows
// ============================================================================

const DEMO_TRANSITIONS = {
    new: ['contacted', 'rejected'],
    contacted: ['demo_scheduled', 'lost'],
    demo_scheduled: ['demo_completed', 'lost'],
    demo_completed: ['converted', 'lost'],
    converted: [],
    lost: [],
    rejected: [],
};

const CONTACT_TRANSITIONS = {
    new: ['in_progress', 'closed'],
    in_progress: ['resolved', 'closed'],
    resolved: [],
    closed: [],
};

// ============================================================================
// HELPERS
// ============================================================================

function stripHtml(str) {
    if (!str) return str;
    return str.replaceAll(/<[^>]*>/g, '').trim();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function buildCrmUrl(type, id) {
    const baseUrl = config.frontendUrl && config.frontendUrl !== '*'
        ? config.frontendUrl
        : 'http://localhost:5173';
    return `${baseUrl}/sysadmin/${type}/${id}`;
}

// ============================================================================
// PUBLIC — Submit Demo Request
// ============================================================================

async function submitDemoRequest(data, ipAddress, userAgent) {
    // Duplicate check: same email in last 24h
    const dupCheck = await query(
        `SELECT id FROM demo_requests
         WHERE email = $1 AND created_at > NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [data.email.toLowerCase()]
    );

    if (dupCheck.rows.length > 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.DEMO_REQUEST_DUPLICATE), { status: HTTP_STATUS.CONFLICT });
    }

    const result = await query(
        `INSERT INTO demo_requests (
            college_name, contact_person, designation, college_type,
            email, phone, number_of_students,
            city, state, preferred_demo_date, preferred_demo_time,
            referral_source, ip_address, user_agent
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id, created_at`,
        [
            stripHtml(data.college_name),
            stripHtml(data.contact_person),
            data.designation,
            data.college_type,
            data.email.toLowerCase().trim(),
            data.phone.trim(),
            data.number_of_students || null,
            stripHtml(data.city) || null,
            stripHtml(data.state) || null,
            data.preferred_demo_date || null,
            data.preferred_demo_time || null,
            data.referral_source || null,
            ipAddress || null,
            userAgent || null,
        ]
    );

    const created = result.rows[0];

    // Fire-and-forget email notification
    sendDemoNotification(data, created.id).catch((err) => {
        logger.error(`${LOG.API_ERROR} Failed to send demo notification email`, { error: err.message });
    });

    return created;
}

// ============================================================================
// PUBLIC — Submit Contact Inquiry
// ============================================================================

async function submitContactInquiry(data, ipAddress, userAgent) {
    // Duplicate check: same email + similar message in last 24h
    const dupCheck = await query(
        `SELECT id FROM contact_inquiries
         WHERE email = $1 AND created_at > NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [data.email.toLowerCase()]
    );

    if (dupCheck.rows.length > 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.CONTACT_INQUIRY_DUPLICATE), { status: HTTP_STATUS.CONFLICT });
    }

    const result = await query(
        `INSERT INTO contact_inquiries (
            name, email, phone, subject, message, ip_address, user_agent
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, created_at`,
        [
            stripHtml(data.name),
            data.email.toLowerCase().trim(),
            data.phone.trim(),
            data.subject || null,
            stripHtml(data.message),
            ipAddress || null,
            userAgent || null,
        ]
    );

    const created = result.rows[0];

    // Fire-and-forget email notification
    sendContactNotification(data, created.id).catch((err) => {
        logger.error(`${LOG.API_ERROR} Failed to send contact notification email`, { error: err.message });
    });

    return created;
}

// ============================================================================
// SYSADMIN — List Demo Requests
// ============================================================================

async function listDemoRequests({ page, limit, offset, status, college_type, search, date_from, date_to }) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
        conditions.push(`status = $${paramIdx++}`);
        params.push(status);
    }
    if (college_type && college_type !== 'all') {
        conditions.push(`college_type = $${paramIdx++}`);
        params.push(college_type);
    }
    if (search) {
        conditions.push(`(college_name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR contact_person ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
    }
    if (date_from) {
        conditions.push(`created_at >= $${paramIdx++}`);
        params.push(date_from);
    }
    if (date_to) {
        conditions.push(`created_at <= $${paramIdx++}::date + INTERVAL '1 day'`);
        params.push(date_to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
        `SELECT COUNT(*) AS total FROM demo_requests ${where}`,
        params
    );
    const total = Number.parseInt(countResult.rows[0].total, 10);

    const dataResult = await query(
        `SELECT id, college_name, contact_person, designation, college_type,
                email, phone, number_of_students, city, state,
                preferred_demo_date, preferred_demo_time, referral_source,
                status, assigned_to, converted_college_id,
                created_at, updated_at
         FROM demo_requests ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
    );

    return { rows: dataResult.rows, total };
}

// ============================================================================
// SYSADMIN — Get Demo Request Detail (with notes)
// ============================================================================

async function getDemoRequestById(id) {
    const result = await query(
        `SELECT * FROM demo_requests WHERE id = $1`,
        [id]
    );

    if (result.rows.length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.DEMO_REQUEST_NOT_FOUND), { status: HTTP_STATUS.NOT_FOUND });
    }

    const notes = await query(
        `SELECT id, note, created_by, created_at
         FROM submission_notes
         WHERE submission_type = 'demo_request' AND submission_id = $1
         ORDER BY created_at ASC`,
        [id]
    );

    return { ...result.rows[0], notes: notes.rows };
}

// ============================================================================
// SYSADMIN — Update Demo Request Status
// ============================================================================

async function updateDemoRequestStatus(id, data) {
    // Get current status
    const current = await query(`SELECT status FROM demo_requests WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.DEMO_REQUEST_NOT_FOUND), { status: HTTP_STATUS.NOT_FOUND });
    }

    const currentStatus = current.rows[0].status;
    const allowedNext = DEMO_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(data.status)) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.DEMO_REQUEST_INVALID_TRANSITION),
            { status: HTTP_STATUS.BAD_REQUEST }
        );
    }

    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const params = [id, data.status];
    let paramIdx = 3;

    if (data.converted_college_id !== undefined) {
        setClauses.push(`converted_college_id = $${paramIdx++}`);
        params.push(data.converted_college_id);
    }
    if (data.assigned_to !== undefined) {
        setClauses.push(`assigned_to = $${paramIdx++}`);
        params.push(data.assigned_to);
    }

    const result = await query(
        `UPDATE demo_requests SET ${setClauses.join(', ')} WHERE id = $1
         RETURNING id, status, assigned_to, converted_college_id, updated_at`,
        params
    );

    return result.rows[0];
}

// ============================================================================
// SYSADMIN — List Contact Inquiries
// ============================================================================

async function listContactInquiries({ page, limit, offset, status, search, date_from, date_to }) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
        conditions.push(`status = $${paramIdx++}`);
        params.push(status);
    }
    if (search) {
        conditions.push(`(name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR message ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
    }
    if (date_from) {
        conditions.push(`created_at >= $${paramIdx++}`);
        params.push(date_from);
    }
    if (date_to) {
        conditions.push(`created_at <= $${paramIdx++}::date + INTERVAL '1 day'`);
        params.push(date_to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
        `SELECT COUNT(*) AS total FROM contact_inquiries ${where}`,
        params
    );
    const total = Number.parseInt(countResult.rows[0].total, 10);

    const dataResult = await query(
        `SELECT id, name, email, phone, subject, message,
                status, created_at, updated_at
         FROM contact_inquiries ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
    );

    return { rows: dataResult.rows, total };
}

// ============================================================================
// SYSADMIN — Get Contact Inquiry Detail (with notes)
// ============================================================================

async function getContactInquiryById(id) {
    const result = await query(
        `SELECT * FROM contact_inquiries WHERE id = $1`,
        [id]
    );

    if (result.rows.length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.CONTACT_INQUIRY_NOT_FOUND), { status: HTTP_STATUS.NOT_FOUND });
    }

    const notes = await query(
        `SELECT id, note, created_by, created_at
         FROM submission_notes
         WHERE submission_type = 'contact_inquiry' AND submission_id = $1
         ORDER BY created_at ASC`,
        [id]
    );

    return { ...result.rows[0], notes: notes.rows };
}

// ============================================================================
// SYSADMIN — Update Contact Inquiry Status
// ============================================================================

async function updateContactInquiryStatus(id, data) {
    const current = await query(`SELECT status FROM contact_inquiries WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.CONTACT_INQUIRY_NOT_FOUND), { status: HTTP_STATUS.NOT_FOUND });
    }

    const currentStatus = current.rows[0].status;
    const allowedNext = CONTACT_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(data.status)) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CONTACT_INQUIRY_INVALID_TRANSITION),
            { status: HTTP_STATUS.BAD_REQUEST }
        );
    }

    const result = await query(
        `UPDATE contact_inquiries SET status = $2, updated_at = NOW() WHERE id = $1
         RETURNING id, status, updated_at`,
        [id, data.status]
    );

    return result.rows[0];
}

// ============================================================================
// SYSADMIN — Add Note (polymorphic)
// ============================================================================

async function addNote(submissionType, submissionId, note, createdBy) {
    // Verify parent exists
    const table = submissionType === 'demo_request' ? 'demo_requests' : 'contact_inquiries';
    const exists = await query(`SELECT id FROM ${table} WHERE id = $1`, [submissionId]);
    if (exists.rows.length === 0) {
        const msg = submissionType === 'demo_request'
            ? ERROR_MESSAGES.DEMO_REQUEST_NOT_FOUND
            : ERROR_MESSAGES.CONTACT_INQUIRY_NOT_FOUND;
        throw Object.assign(new Error(msg), { status: HTTP_STATUS.NOT_FOUND });
    }

    const result = await query(
        `INSERT INTO submission_notes (submission_type, submission_id, note, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, note, created_by, created_at`,
        [submissionType, submissionId, note.trim(), createdBy]
    );

    return result.rows[0];
}

// ============================================================================
// SYSADMIN — Dashboard Stats
// ============================================================================

async function getSubmissionStats() {
    const demoStats = await query(`
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'new') AS new_count,
            COUNT(*) FILTER (WHERE status = 'contacted') AS contacted,
            COUNT(*) FILTER (WHERE status = 'demo_scheduled') AS scheduled,
            COUNT(*) FILTER (WHERE status = 'demo_completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'converted') AS converted,
            COUNT(*) FILTER (WHERE status = 'lost') AS lost,
            COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
        FROM demo_requests
    `);

    const contactStats = await query(`
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'new') AS new_count,
            COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
            COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
            COUNT(*) FILTER (WHERE status = 'closed') AS closed,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
        FROM contact_inquiries
    `);

    const demoRow = demoStats.rows[0];
    const contactRow = contactStats.rows[0];

    const totalDemo = Number.parseInt(demoRow.total, 10);
    const convertedCount = Number.parseInt(demoRow.converted, 10);

    return {
        demo_requests: {
            total: totalDemo,
            new: Number.parseInt(demoRow.new_count, 10),
            contacted: Number.parseInt(demoRow.contacted, 10),
            scheduled: Number.parseInt(demoRow.scheduled, 10),
            completed: Number.parseInt(demoRow.completed, 10),
            converted: convertedCount,
            lost: Number.parseInt(demoRow.lost, 10),
            rejected: Number.parseInt(demoRow.rejected, 10),
            last_30_days: Number.parseInt(demoRow.last_30_days, 10),
            conversion_rate: totalDemo > 0 ? Math.round((convertedCount / totalDemo) * 100) : 0,
        },
        contact_inquiries: {
            total: Number.parseInt(contactRow.total, 10),
            new: Number.parseInt(contactRow.new_count, 10),
            in_progress: Number.parseInt(contactRow.in_progress, 10),
            resolved: Number.parseInt(contactRow.resolved, 10),
            closed: Number.parseInt(contactRow.closed, 10),
            last_30_days: Number.parseInt(contactRow.last_30_days, 10),
        },
    };
}

// ============================================================================
// EMAIL NOTIFICATIONS (internal)
// ============================================================================

async function sendDemoNotification(data, id) {
    const crmLink = buildCrmUrl('demo-requests', id);

    const subject = `🎓 New Demo Request — ${escapeHtml(data.college_name)}`;
    const text = [
        `New demo request received:`,
        ``,
        `College: ${data.college_name}`,
        `Contact: ${data.contact_person} (${data.designation})`,
        `Type: ${data.college_type}`,
        `Email: ${data.email}`,
        `Phone: ${data.phone}`,
        data.number_of_students ? `Students: ${data.number_of_students}` : null,
        data.city ? `City: ${data.city}` : null,
        data.state ? `State: ${data.state}` : null,
        data.preferred_demo_date ? `Preferred Date: ${data.preferred_demo_date}` : null,
        data.preferred_demo_time ? `Preferred Time: ${data.preferred_demo_time}` : null,
        data.referral_source ? `Referral: ${data.referral_source}` : null,
        ``,
        `View in dashboard: ${crmLink}`,
    ].filter(Boolean).join('\n');

    const html = `
        <h2>New Demo Request</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
            <tr><td style="padding:4px 12px;font-weight:bold;">College</td><td style="padding:4px 12px;">${escapeHtml(data.college_name)}</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold;">Contact</td><td style="padding:4px 12px;">${escapeHtml(data.contact_person)} (${escapeHtml(data.designation)})</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold;">Type</td><td style="padding:4px 12px;">${escapeHtml(data.college_type)}</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold;">Email</td><td style="padding:4px 12px;">${escapeHtml(data.email)}</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold;">Phone</td><td style="padding:4px 12px;">${escapeHtml(data.phone)}</td></tr>
            ${data.number_of_students ? `<tr><td style="padding:4px 12px;font-weight:bold;">Students</td><td style="padding:4px 12px;">${escapeHtml(data.number_of_students)}</td></tr>` : ''}
            ${data.city ? `<tr><td style="padding:4px 12px;font-weight:bold;">City</td><td style="padding:4px 12px;">${escapeHtml(data.city)}</td></tr>` : ''}
            ${data.state ? `<tr><td style="padding:4px 12px;font-weight:bold;">State</td><td style="padding:4px 12px;">${escapeHtml(data.state)}</td></tr>` : ''}
            ${data.preferred_demo_date ? `<tr><td style="padding:4px 12px;font-weight:bold;">Preferred Date</td><td style="padding:4px 12px;">${escapeHtml(data.preferred_demo_date)}</td></tr>` : ''}
            ${data.preferred_demo_time ? `<tr><td style="padding:4px 12px;font-weight:bold;">Preferred Time</td><td style="padding:4px 12px;">${escapeHtml(data.preferred_demo_time)}</td></tr>` : ''}
            ${data.referral_source ? `<tr><td style="padding:4px 12px;font-weight:bold;">Referral</td><td style="padding:4px 12px;">${escapeHtml(data.referral_source)}</td></tr>` : ''}
        </table>
        <p><a href="${crmLink}">View in Dashboard →</a></p>
    `;

    await sendEmail({
        to: config.sysadminEmail,
        subject,
        text,
        html,
    });
}

async function sendContactNotification(data, id) {
    const crmLink = buildCrmUrl('contact-inquiries', id);

    const subject = `📩 New Contact Inquiry — ${escapeHtml(data.name)}`;
    const text = [
        `New contact inquiry received:`,
        ``,
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        `Phone: ${data.phone}`,
        data.subject ? `Subject: ${data.subject}` : null,
        `Message: ${data.message}`,
        ``,
        `View in dashboard: ${crmLink}`,
    ].filter(Boolean).join('\n');

    const html = `
        <h2>New Contact Inquiry</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
            <tr><td style="padding:4px 12px;font-weight:bold;">Name</td><td style="padding:4px 12px;">${escapeHtml(data.name)}</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold;">Email</td><td style="padding:4px 12px;">${escapeHtml(data.email)}</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold;">Phone</td><td style="padding:4px 12px;">${escapeHtml(data.phone)}</td></tr>
            ${data.subject ? `<tr><td style="padding:4px 12px;font-weight:bold;">Subject</td><td style="padding:4px 12px;">${escapeHtml(data.subject)}</td></tr>` : ''}
        </table>
        <blockquote style="margin:16px 0;padding:12px;background:#f5f5f5;border-left:4px solid #667;font-style:italic;">
            ${escapeHtml(data.message)}
        </blockquote>
        <p><a href="${crmLink}">View in Dashboard →</a></p>
    `;

    await sendEmail({
        to: config.sysadminEmail,
        subject,
        text,
        html,
    });
}

module.exports = {
    submitDemoRequest,
    submitContactInquiry,
    listDemoRequests,
    getDemoRequestById,
    updateDemoRequestStatus,
    listContactInquiries,
    getContactInquiryById,
    updateContactInquiryStatus,
    addNote,
    getSubmissionStats,
};
