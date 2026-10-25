export type HealthResponse = {
  status: 'ok';
  service: 'resumora-api';
  environment: 'development';
  capabilities: {
    authentication: 'not_implemented';
    database: 'not_connected';
  };
  requestId: string;
};

export type ApiError = {
  error: { code: 'AUTH_NOT_IMPLEMENTED' | 'METHOD_NOT_ALLOWED' | 'NOT_FOUND'; message: string };
  requestId: string;
};
