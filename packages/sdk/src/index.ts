export async function apiFetch<T>(path: string, token: string, body?: any, method = "POST"): Promise<T> {
  const res = await fetch(`${process.env.VITE_API_BASE_URL || "http://localhost:3000"}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${method} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

