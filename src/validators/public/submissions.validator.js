/**
 * ============================================================================
 * SUBMISSIONS VALIDATOR — Joi Schemas for Demo & Contact Endpoints
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// Shared patterns
// ============================================================================
const indianPhoneRegex = /^[6-9]\d{9}$/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// PUBLIC — Submit Demo Request
// POST /api/public/demo-request
// ============================================================================
const demoRequestSchema = Joi.object({
    college_name: Joi.string().trim().min(2).max(255).required().messages({
        'string.empty': 'College name is required',
        'string.min': 'College name must be at least 2 characters',
        'any.required': 'College name is required',
    }),
    contact_person: Joi.string().trim().min(2).max(255).required().messages({
        'string.empty': 'Contact person name is required',
        'string.min': 'Contact person name must be at least 2 characters',
        'any.required': 'Contact person name is required',
    }),
    designation: Joi.string().valid('TPO', 'HOD', 'Principal', 'Director', 'Other').required().messages({
        'any.only': 'Designation must be one of: TPO, HOD, Principal, Director, Other',
        'any.required': 'Designation is required',
    }),
    college_type: Joi.string().valid('Engineering', 'Diploma', 'MBA', 'Polytechnic', 'Pharmacy', 'Medical', 'Degree', 'Other').required().messages({
        'any.only': 'College type must be one of: Engineering, Diploma, MBA, Polytechnic, Pharmacy, Medical, Degree, Other',
        'any.required': 'College type is required',
    }),
    email: Joi.string().email().max(255).required().messages({
        'string.email': 'Please enter a valid email address',
        'any.required': 'Email is required',
    }),
    phone: Joi.string().pattern(indianPhoneRegex).required().messages({
        'string.pattern.base': 'Please enter a valid 10-digit Indian phone number',
        'any.required': 'Phone number is required',
    }),
    number_of_students: Joi.number().integer().positive().max(100000).optional().allow(null).messages({
        'number.base': 'Number of students must be a valid number',
        'number.positive': 'Number of students must be positive',
    }),
    city: Joi.string().trim().max(100).optional().allow('', null),
    state: Joi.string().trim().max(100).optional().allow('', null),
    preferred_demo_date: Joi.date().iso().min('now').optional().allow(null).messages({
        'date.min': 'Preferred demo date must be today or later',
    }),
    preferred_demo_time: Joi.string().valid('morning', 'afternoon', 'evening').optional().allow('', null).messages({
        'any.only': 'Preferred time must be morning, afternoon, or evening',
    }),
    referral_source: Joi.string().valid(
        'Google Search', 'Social Media', 'LinkedIn', 'Referral from College',
        'College Event', 'Blog/Article', 'Other'
    ).optional().allow('', null),

    // Honeypot — must be empty
    website: Joi.string().max(0).optional().allow(''),
});

// ============================================================================
// PUBLIC — Submit Contact Inquiry
// POST /api/public/contact-inquiry
// ============================================================================
const contactInquirySchema = Joi.object({
    name: Joi.string().trim().min(2).max(255).required().messages({
        'string.empty': 'Name is required',
        'string.min': 'Name must be at least 2 characters',
        'any.required': 'Name is required',
    }),
    email: Joi.string().email().max(255).required().messages({
        'string.email': 'Please enter a valid email address',
        'any.required': 'Email is required',
    }),
    phone: Joi.string().pattern(indianPhoneRegex).required().messages({
        'string.pattern.base': 'Please enter a valid 10-digit Indian phone number',
        'any.required': 'Phone number is required',
    }),
    subject: Joi.string().valid('Pricing', 'Partnership', 'Technical', 'General', 'Other').optional().allow('', null).messages({
        'any.only': 'Subject must be one of: Pricing, Partnership, Technical, General, Other',
    }),
    message: Joi.string().trim().min(10).max(5000).required().messages({
        'string.empty': 'Message is required',
        'string.min': 'Message must be at least 10 characters',
        'any.required': 'Message is required',
    }),

    // Honeypot — must be empty
    website: Joi.string().max(0).optional().allow(''),
});

// ============================================================================
// SYSADMIN — List Demo Requests (query)
// GET /api/sysadmin/demo-requests
// ============================================================================
const listDemoRequestsSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string().valid('all', 'new', 'contacted', 'demo_scheduled', 'demo_completed', 'converted', 'lost', 'rejected').optional(),
    college_type: Joi.string().valid('all', 'Engineering', 'Diploma', 'MBA', 'Polytechnic', 'Pharmacy', 'Medical', 'Degree', 'Other').optional(),
    search: Joi.string().trim().max(200).optional().allow(''),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().optional(),
});

// ============================================================================
// SYSADMIN — List Contact Inquiries (query)
// GET /api/sysadmin/contact-inquiries
// ============================================================================
const listContactInquiriesSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string().valid('all', 'new', 'in_progress', 'resolved', 'closed').optional(),
    search: Joi.string().trim().max(200).optional().allow(''),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().optional(),
});

// ============================================================================
// SYSADMIN — Update Status
// PATCH /api/sysadmin/demo-requests/:id/status
// ============================================================================
const updateDemoStatusSchema = Joi.object({
    status: Joi.string().valid('new', 'contacted', 'demo_scheduled', 'demo_completed', 'converted', 'lost', 'rejected').required().messages({
        'any.only': 'Invalid status value',
        'any.required': 'Status is required',
    }),
    converted_college_id: Joi.string().pattern(uuidRegex).optional().allow(null).messages({
        'string.pattern.base': 'Invalid college ID format',
    }),
    assigned_to: Joi.string().trim().max(255).optional().allow('', null),
});

const updateContactStatusSchema = Joi.object({
    status: Joi.string().valid('new', 'in_progress', 'resolved', 'closed').required().messages({
        'any.only': 'Invalid status value',
        'any.required': 'Status is required',
    }),
});

// ============================================================================
// SYSADMIN — Add Note
// POST /api/sysadmin/demo-requests/:id/notes
// ============================================================================
const addNoteSchema = Joi.object({
    note: Joi.string().trim().min(1).max(2000).required().messages({
        'string.empty': 'Note cannot be empty',
        'string.max': 'Note cannot exceed 2000 characters',
        'any.required': 'Note is required',
    }),
});

// ============================================================================
// SYSADMIN — Param validation
// ============================================================================
const submissionIdParamSchema = Joi.object({
    id: Joi.string().pattern(uuidRegex).required().messages({
        'string.pattern.base': 'Invalid submission ID format',
        'any.required': 'Submission ID is required',
    }),
});

module.exports = {
    demoRequestSchema,
    contactInquirySchema,
    listDemoRequestsSchema,
    listContactInquiriesSchema,
    updateDemoStatusSchema,
    updateContactStatusSchema,
    addNoteSchema,
    submissionIdParamSchema,
};
