module.exports = {
  paths: {
    /**
     * ============================================================
     * STUDENT AUTH & MANAGEMENT
     * ============================================================
     */

    '/api/students/register': {
      post: {
        tags: ['Students'],
        summary: 'Register a single student (Public)',
        description: 'Registers a student under a college',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'student_name',
                  'student_email',
                  'student_password',
                  'student_department',
                  'student_year',
                  'college_id'
                ],
                properties: {
                  student_name: {
                    type: 'string',
                    example: 'Rahul Sharma'
                  },
                  student_email: {
                    type: 'string',
                    format: 'email',
                    example: 'rahul@student.com'
                  },
                  student_password: {
                    type: 'string',
                    example: 'Password@123'
                  },
                  student_department: {
                    type: 'string',
                    example: 'CSE'
                  },
                  student_year: {
                    type: 'integer',
                    example: 3
                  },
                  college_id: {
                    type: 'string',
                    example: 'uuid-college-id'
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Student registered successfully' },
          409: { description: 'Email already exists' },
          400: { description: 'Invalid college or inactive college' },
          500: { description: 'Server error' }
        }
      }
    },

    '/api/students/bulk': {
      post: {
        tags: ['Students'],
        summary: 'Bulk register students (Admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['students'],
                properties: {
                  students: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: [
                        'student_name',
                        'student_email',
                        'student_password',
                        'student_department',
                        'student_year'
                      ],
                      properties: {
                        student_name: { type: 'string' },
                        student_email: {
                          type: 'string',
                          format: 'email'
                        },
                        student_password: { type: 'string' },
                        student_department: { type: 'string' },
                        student_year: {
                          type: 'integer',
                          example: 2
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Bulk registration completed' },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin only' },
          500: { description: 'Server error' }
        }
      }
    },

    '/api/students/login': {
      post: {
        tags: ['Students'],
        summary: 'Student login (Public)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'student_email',
                  'student_password',
                  'college_id'
                ],
                properties: {
                  student_email: {
                    type: 'string',
                    format: 'email',
                    example: 'rahul@student.com'
                  },
                  student_password: {
                    type: 'string',
                    example: 'Password@123'
                  },
                  college_id: {
                    type: 'string',
                    example: 'uuid-college-id'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid email or password' },
          403: { description: 'Access denied' },
          500: { description: 'Server error' }
        }
      }
    },

    '/api/students/logout': {
      post: {
        tags: ['Students'],
        summary: 'Logout student',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Logout successful' },
          401: { description: 'Unauthorized' }
        }
      }
    },

    '/api/students/password': {
      put: {
        tags: ['Students'],
        summary: 'Update student password (Authenticated)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['old_password', 'new_password'],
                properties: {
                  old_password: {
                    type: 'string',
                    example: 'OldPass@123'
                  },
                  new_password: {
                    type: 'string',
                    example: 'NewPass@123'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Password updated successfully' },
          401: { description: 'Invalid old password' },
          404: { description: 'Student not found' },
          500: { description: 'Server error' }
        }
      }
    },

    '/api/students/{studentId}/profile': {
      put: {
        tags: ['Students'],
        summary: 'Update student profile (Admin / Teacher)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'studentId',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  student_name: { type: 'string' },
                  student_department: { type: 'string' },
                  student_year: { type: 'integer' },
                  status: {
                    type: 'string',
                    example: 'active'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Student profile updated successfully' },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin / Teacher only' },
          404: { description: 'Student not found' },
          500: { description: 'Server error' }
        }
      }
    }
  }
};
