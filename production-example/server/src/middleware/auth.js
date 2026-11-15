import jwt from "jsonwebtoken";
import { AppError } from "../lib/errors.js";
import { id } from "../lib/validation.js";

export function createAuthenticator(jwtConfig) {
  return function authenticate(token) {
    try {
      if (typeof token !== "string" || token.length > 8192) throw new Error("Invalid token");
      const claims = jwt.verify(token, jwtConfig.secret, {
        algorithms: ["HS256"], issuer: jwtConfig.issuer, audience: jwtConfig.audience,
      });
      if (!Number.isInteger(claims.exp)) throw new Error("exp is required");
      return {
        userId: id(claims.sub, "sub"), tenantId: id(claims.tenantId, "tenantId"),
        roles: Array.isArray(claims.roles) ? claims.roles.filter((r) => typeof r === "string") : [],
        expiresAt: claims.exp * 1000,
      };
    } catch {
      throw new AppError("UNAUTHORIZED", "A valid, unexpired access token is required", 401);
    }
  };
}

export function socketAuth(authenticate) {
  return (socket, next) => {
    try {
      const principal = authenticate(socket.handshake.auth?.token);
      // Recovered rooms belong to the original principal. Do not let another
      // user's valid token adopt those rooms on a recovered session.
      if (socket.recovered && (socket.data.userId !== principal.userId || socket.data.tenantId !== principal.tenantId)) {
        throw new AppError("UNAUTHORIZED", "Reconnect with a new session", 401);
      }
      socket.data = principal;
      socket.userId = principal.userId;
      next();
    } catch (error) {
      const failure = new Error("Authentication failed");
      failure.data = { code: "UNAUTHORIZED", message: error.message };
      next(failure);
    }
  };
}

export function httpAuth(authenticate) {
  return (req, res, next) => {
    try {
      const header = req.get("authorization") || "";
      req.user = authenticate(header.startsWith("Bearer ") ? header.slice(7) : undefined);
      next();
    } catch (error) { next(error); }
  };
}
