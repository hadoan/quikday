/**
 * Example NestJS Controller for Google Calendar OAuth Flow
 *
 * This shows how to use the library functions in your API.
 * Adapt to your authentication, state encoding, and encryption patterns.
 */

import { Controller, Get, Query, Req, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { generateGoogleCalendarAuthUrl } from './add.js';
import { exchangeGoogleCalendarCode } from './callback.js';
// import { PrismaService } from '@quikday/prisma'; // Your Prisma service
// import { encryptCredential } from '@quikday/crypto'; // Your encryption service
// import { AuthGuard } from '../auth/auth.guard'; // Your auth guard

/**
 * Example state encoder/decoder (adapt to your needs)
 */
function encodeOAuthState(data: { userId: string; returnTo?: string }): string {
  // In production: use signed JWT or encrypted state
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeOAuthState(state: string): { userId: string; returnTo?: string } {
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
  } catch {
    throw new Error('Invalid state parameter');
  }
}

// @Controller('integrations/google-calendar')
export class GoogleCalendarController {
  // constructor(
  //   private readonly prisma: PrismaService,
  //   private readonly crypto: CryptoService,
  // ) {}

  /**
   * Step 1: Initiate OAuth flow
   * GET /api/integrations/google-calendar/add
   */
  // @Get('add')
  // @UseGuards(AuthGuard)
  async initiateOAuth(
    // @Req() req: Request & { user: { sub: string } },
    // @Query('returnTo') returnTo?: string,
  ) {
    const userId = 'req.user.sub'; // Replace with actual user ID from auth

    try {
      const { url } = generateGoogleCalendarAuthUrl({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: `${process.env.WEBAPP_URL}/api/integrations/google-calendar/callback`,
        state: encodeOAuthState({ userId, returnTo: 'returnTo' }),
      });

      return { url };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to generate OAuth URL',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Step 2: Handle OAuth callback
   * GET /api/integrations/google-calendar/callback?code=...&state=...
   */
  // @Get('callback')
  async handleCallback(
    // @Query('code') code: string,
    // @Query('state') state: string,
    // @Res() res: Response,
  ) {
    const code = 'auth_code'; // Replace with actual code from query
    const state = 'state_param'; // Replace with actual state from query

    // Validate inputs
    if (!code || typeof code !== 'string') {
      throw new HttpException('Missing or invalid code parameter', HttpStatus.BAD_REQUEST);
    }

    if (!state) {
      throw new HttpException('Missing state parameter', HttpStatus.BAD_REQUEST);
    }

    // Decode and validate state
    let decodedState: { userId: string; returnTo?: string };
    try {
      decodedState = decodeOAuthState(state);
    } catch {
      throw new HttpException('Invalid state parameter', HttpStatus.BAD_REQUEST);
    }

    try {
      // Exchange code for tokens
      const result = await exchangeGoogleCalendarCode({
        code,
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: `${process.env.WEBAPP_URL}/api/integrations/google-calendar/callback`,
      });

      // Encrypt tokens before storing
      // const encryptedKey = await this.crypto.encrypt(JSON.stringify(result.tokens));

      // Store credential in database
      // await this.prisma.credential.create({
      //   data: {
      //     type: 'google_calendar',
      //     key: encryptedKey, // Store encrypted!
      //     userId: decodedState.userId,
      //     appId: 'google-calendar',
      //   },
      // });

      // Redirect user to success page or return URL
      const redirectTo =
        decodedState.returnTo || `${process.env.WEBAPP_URL}/apps/installed/calendar/google-calendar`;

      // In real implementation: res.redirect(redirectTo);
      return { success: true, redirectTo };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'OAuth callback failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Example: Get user's Google Calendar credentials
   * (with automatic token refresh if expired)
   */
  // @Get('credentials')
  // @UseGuards(AuthGuard)
  async getCredentials(
    // @Req() req: Request & { user: { sub: string } },
  ) {
    const userId = 'req.user.sub';

    // Fetch credential from database
    // const credential = await this.prisma.credential.findFirst({
    //   where: {
    //     userId,
    //     type: 'google_calendar',
    //   },
    // });

    // if (!credential) {
    //   throw new HttpException('Google Calendar not connected', HttpStatus.NOT_FOUND);
    // }

    // Decrypt tokens
    // const tokens = JSON.parse(await this.crypto.decrypt(credential.key));

    // Check if token needs refresh
    // if (isTokenExpired(tokens)) {
    //   const refreshed = await refreshGoogleCalendarToken({
    //     refreshToken: tokens.refresh_token!,
    //     clientId: process.env.GOOGLE_CLIENT_ID!,
    //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    //   });

    //   // Update stored credential
    //   await this.prisma.credential.update({
    //     where: { id: credential.id },
    //     data: { key: await this.crypto.encrypt(JSON.stringify(refreshed.tokens)) },
    //   });

    //   return { tokens: refreshed.tokens };
    // }

    // return { tokens };
  }
}
