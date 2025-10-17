import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import jwksClient from "jwks-rsa";
import jwt from "jsonwebtoken";
import { ConfigService } from "../config/config.service";

@Injectable()
export class KindeGuard implements CanActivate {
  private client = this.config.env.KINDE_JWKS_URL
    ? jwksClient({ jwksUri: this.config.env.KINDE_JWKS_URL })
    : null;

  constructor(private config: ConfigService) {}

  private getKey = (header: any, cb: (err: any, key?: string) => void) => {
    if (!this.client) return cb(new Error("JWKS client not configured"));
    this.client.getSigningKey(header.kid, (err: any, key: any) => cb(err, key?.getPublicKey()));
  };

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) throw new UnauthorizedException("Missing token");

    if (this.config.isKindeBypass) {
      // In dev, trust any token and assign a minimal user payload
      req.user = { sub: "dev-user", email: "dev@example.com" };
      return true;
    }

    const payload = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.getKey,
        { audience: this.config.env.KINDE_AUDIENCE, issuer: this.config.env.KINDE_ISSUER_URL },
        (err: any, decoded: any) => (err ? reject(err) : resolve(decoded))
      );
    });
    req.user = payload;
    return true;
  }
}
