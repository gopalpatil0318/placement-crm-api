/**
 * ============================================================================
 * COMPANY CONTACT VALIDATORS — Joi Schemas for Company Contact Management
 * ============================================================================
 *   - addContactSchema               POST  /add_company_contact/:companyId
 *   - listContactsSchema             GET   /get_company_contacts/:companyId (query)
 *   - updateContactSchema            PUT   /update_contact/:contactId
 *   - toggleContactStatusSchema      PATCH /toggle_contact_status/:contactId
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// ADD CONTACT
// ============================================================================

const addContactSchema = Joi.object({
    contact_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Contact name is required',
            'string.min': 'Contact name must be at least 2 characters',
            'string.max': 'Contact name cannot exceed 200 characters',
            'any.required': 'Contact name is required',
        }),

    contact_designation: Joi.string()
        .max(150)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Designation cannot exceed 150 characters',
        }),

    contact_email: Joi.string()
        .email()
        .max(255)
        .optional()
        .allow(null, '')
        .messages({
            'string.email': 'Please provide a valid email address',
            'string.max': 'Email cannot exceed 255 characters',
        }),

    contact_phone: Joi.string()
        .pattern(/^[0-9]{10,15}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Phone number must be 10-15 digits',
        }),

    is_primary: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'is_primary must be true or false',
        }),

    notes: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Notes cannot exceed 1000 characters',
        }),
});

// ============================================================================
// LIST CONTACTS (query params)
// ============================================================================

const listContactsSchema = Joi.object({
    is_active: Joi.boolean()
        .optional(),

    search: Joi.string()
        .max(100)
        .optional(),
});

// ============================================================================
// UPDATE CONTACT
// ============================================================================

const updateContactSchema = Joi.object({
    contact_name: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Contact name must be at least 2 characters',
            'string.max': 'Contact name cannot exceed 200 characters',
        }),

    contact_designation: Joi.string()
        .max(150)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Designation cannot exceed 150 characters',
        }),

    contact_email: Joi.string()
        .email()
        .max(255)
        .optional()
        .allow(null, '')
        .messages({
            'string.email': 'Please provide a valid email address',
        }),

    contact_phone: Joi.string()
        .pattern(/^[0-9]{10,15}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Phone number must be 10-15 digits',
        }),

    is_primary: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_primary must be true or false',
        }),

    notes: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Notes cannot exceed 1000 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// TOGGLE CONTACT STATUS
// ============================================================================

const toggleContactStatusSchema = Joi.object({
    is_active: Joi.boolean()
        .required()
        .messages({
            'boolean.base': 'is_active must be true or false',
            'any.required': 'is_active is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS — UUID validation for route parameters
// ============================================================================

const companyIdParamSchema = Joi.object({
    companyId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid company ID format',
        'any.required': 'Company ID is required',
    }),
});

const contactIdParamSchema = Joi.object({
    contactId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid contact ID format',
        'any.required': 'Contact ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addContactSchema,
    listContactsSchema,
    updateContactSchema,
    toggleContactStatusSchema,
    companyIdParamSchema,
    contactIdParamSchema,
};
