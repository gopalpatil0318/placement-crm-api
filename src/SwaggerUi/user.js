module.exports = {
  paths: {
    /**
     * ============================================================
     * USER MANAGEMENT
     * ============================================================
     */

    '/api/users': {
      post: {
        tags: ['Users'],
        summary: 'Create new user (Admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'user_name',
                  'user_email',
                  'user_password',
                  'user_role'
                ],
                properties: {
                  user_name: {
                    type: 'string',
                    example: 'John Doe'
                  },
                  user_email: {
                    type: 'string',
                    format: 'email',
                    example: 'john@college.com'
                  },
                  user_password: {
                    type: 'string',
                    example: 'Password@123'
                  },
                  user_role: {
                    type: 'string',
                    example: 'TEACHER'
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'User created successfully' },
          400: { description: 'Invalid role or inactive college' },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin only' },
          409: { description: 'User already exists' },
          500: { description: 'Server error' }
        }
      },

      get: {
        tags: ['Users'],
        summary: 'List users in college (Admin / Teacher)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              example: 1
            }
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              example: 20
            }
          }
        ],
        responses: {
          200: { description: 'Users retrieved successfully' },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin / Teacher only' },
          500: { description: 'Server error' }
        }
      }
    },

    '/api/users/{userId}': {
      get: {
        tags: ['Users'],
        summary: 'Get user by ID (Admin / Teacher)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: { description: 'User retrieved successfully' },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin / Teacher only' },
          404: { description: 'User not found' },
          500: { description: 'Server error' }
        }
      },

      put: {
        tags: ['Users'],
        summary: 'Update user (Admin only)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
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
                  user_name: {
                    type: 'string',
                    example: 'Updated Name'
                  },
                  user_role: {
                    type: 'string',
                    example: 'TEACHER'
                  },
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
          200: { description: 'User updated successfully' },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin only' },
          404: { description: 'User not found' },
          500: { description: 'Server error' }
        }
      },

      delete: {
        tags: ['Users'],
        summary: 'Delete user (Soft delete – Admin only)',
        description: 'Marks user as inactive instead of permanent deletion',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: { description: 'User deleted successfully' },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin only' },
          404: { description: 'User not found' },
          500: { description: 'Server error' }
        }
      }
    }
  }
};
