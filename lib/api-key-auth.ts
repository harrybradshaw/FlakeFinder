import { headers } from "next/headers";

interface AuthKeyResponse {
  valid: boolean;
  error: string;
  projectId: string;
  suiteId: string;
}

/**
 * Middleware helper to extract and validate API key from request headers
 */
export async function authenticateApiKey(): Promise<AuthKeyResponse> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader) {
    return {
      valid: false,
      error: "Missing Authorization header",
      projectId: "",
      suiteId: "",
    };
  }

  // Support both "Bearer TOKEN" and "TOKEN" formats
  const apiKey = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : authHeader;

  const isValid = apiKey === process.env.SECRET_API_KEY;

  return {
    valid: isValid,
    error: isValid ? "" : "Invalid key",
    projectId: isValid ? "b627095d-1346-4e0a-901b-b07dd4e5e440" : "",
    suiteId: isValid ? "c2a4f93e-9c39-4c75-b8e1-42e4cbf361a8" : "",
  };
}
