module.exports = {
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['SystemAdmin'],
        summary: 'Login user (System Admin / College User)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    example: 'string'
                  },
                  password: {
                    type: 'string',
                    example: 'string'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Login successful'
          },
          401: {
            description: 'Invalid credentials'
          }
        }
      }
    },

     '/api/colleges': {
  post: {
    tags: ['SystemAdmin'],
    summary: 'Create a new college (SysAdmin only)',

    // ✅ CORRECT PLACE
    security: [{ BearerAuth: [] }],

    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'college_name',
              'college_subdomain',
              'admin_name',
              'admin_email',
              'admin_password'
            ],
            properties: {
              college_name: {
                type: 'string',
                example: 'string'
              },
              college_subdomain: {
                type: 'string',
                example: 'string'
              },
              admin_name: {
                type: 'string',
                example: 'string'
              },
              admin_email: {
                type: 'string',
                format: 'email',
                example: 'string'
              },
              admin_password: {
                type: 'string',
                example: 'string'
              }
            }
          }
        }
      }
    },

    responses: {
      201: { description: 'College created successfully' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden – SysAdmin only' },
      409: { description: 'College already exists' },
      500: { description: 'Server error' }
    }
  },

  get: {
    tags: ['SystemAdmin'],
    summary: 'List all colleges (SysAdmin only)',
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', example: 1 }
      },
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', example: 20 }
      }
    ],
    responses: {
      200: { description: 'Colleges retrieved successfully' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden – SysAdmin only' },
      500: { description: 'Server error' }
    }
  }
},

'/api/colleges/admin/forgot-password': {
  put: {
    tags: ['CollegeAdmin'],
    summary: 'Reset college admin password',
    description: 'Allows college admin to reset password using new and confirm password',
    security: [{ BearerAuth: [] }],

    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['new_password', 'confirm_password'],
            properties: {
              new_password: {
                type: 'string',
                example: 'Admin@1234'
              },
              confirm_password: {
                type: 'string',
                example: 'Admin@1234'
              }
            }
          }
        }
      }
    },

    responses: {
      200: {
        description: 'Password updated successfully'
      },
      400: {
        description: 'Passwords do not match or invalid input'
      },
      401: {
        description: 'Unauthorized'
      },
      403: {
        description: 'Forbidden – Admin only'
      },
      404: {
        description: 'Admin not found'
      },
      500: {
        description: 'Server error'
      }
    }
  }
}
,

'/api/colleges/{collegeId}': {
      get: {
        tags: ['SystemAdmin'],
        summary: 'Get college by ID (SysAdmin only)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'collegeId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'College retrieved successfully'
          },
          401: {
            description: 'Unauthorized'
          },
          403: {
            description: 'Forbidden – SysAdmin only'
          },
          404: {
            description: 'College not found'
          },
          500: {
            description: 'Server error'
          }
        }
      },

      put: {
        tags: ['SystemAdmin'],
        summary: 'Update college details (SysAdmin only)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'collegeId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  college_name: {
                    type: 'string',
                    example: 'string'
                  },
                  college_subdomain: {
                    type: 'string',
                    example: 'string'
                  },
                  status: {
                    type: 'string',
                    example: 'string'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'College updated successfully'
          },
          401: {
            description: 'Unauthorized'
          },
          403: {
            description: 'Forbidden – SysAdmin only'
          },
          404: {
            description: 'College not found'
          },
          409: {
            description: 'Conflict'
          },
          500: {
            description: 'Server error'
          }
        }
      }
    },

      '/api/colleges/{collegeId}/features': {
      put: {
        tags: ['SystemAdmin'],
        summary: 'Update college enabled features (SysAdmin only)',
        description:
          'Core feature must always be included. Frontend must send full feature list.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'collegeId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['enabled_features'],
                properties: {
                  enabled_features: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    example: ['core', 'placements', 'attendance']
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'College features updated successfully'
          },
          400: {
            description: 'Core feature missing'
          },
          401: {
            description: 'Unauthorized'
          },
          403: {
            description: 'Forbidden – SysAdmin only'
          },
          404: {
            description: 'College not found'
          },
          500: {
            description: 'Server error'
          }
        }
      }
    },

    '/api/auth/logout': {
      post: {
        tags: ['SystemAdmin'],
        summary: 'Logout user',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Logout successful' },
          401: { description: 'Unauthorized' }
        }
      }
    },


    '/api/auth/verify': {
      get: {
        tags: ['SystemAdmin'],
        summary: 'Verify JWT token',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Token is valid' },
          401: { description: 'Unauthorized' }
        }
      }
    }
  }
};
