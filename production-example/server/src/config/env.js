function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 8000),
  mongoUri: required("MONGODB_URI"),
  origins: required("CLIENT_ORIGINS").split(",").map((s) => s.trim()),
  jwt: {
    secret: required("JWT_SECRET"),
    issuer: required("JWT_ISSUER"),
    audience: required("JWT_AUDIENCE"),
  },
};
if (config.jwt.secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("Invalid PORT");
}
if (config.origins.some((origin) => !/^https?:\/\/[^/]+$/.test(origin))) {
  throw new Error("CLIENT_ORIGINS must contain explicit HTTP(S) origins");
}
