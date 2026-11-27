import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  resendVerificationRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  verifyEmailRequestSchema,
  type Identity,
  type PasswordResetConfirmRequest,
  type PasswordResetRequest,
  type ResendVerificationRequest,
  type SignInRequest,
  type SignUpRequest,
  type VerifyEmailRequest,
} from '@url-shortener/contracts/identity';
import type { Request, Response } from 'express';
import { IdentityReader } from './account/identity-reader.js';
import { PasswordResetService } from './account/password-reset.service.js';
import { SignUpService } from './account/sign-up.service.js';
import { AuthGuard } from './auth.guard.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import type { Principal } from './principal.js';
import { requireUserSession } from './require-user-session.js';
import { CurrentSessionId } from './sessions/current-session.js';
import { SessionCookie } from './sessions/session-cookie.js';
import { SignInService } from './sign-in/sign-in.service.js';

/** When the edge passes no client address; still one bucket for lockouts. */
const UNKNOWN_ADDRESS = 'unknown';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly signUpService: SignUpService,
    private readonly signInService: SignInService,
    private readonly passwordReset: PasswordResetService,
    private readonly identityReader: IdentityReader,
    private readonly cookie: SessionCookie,
  ) {}

  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  signUp(
    @Body({ schema: signUpRequestSchema }) body: SignUpRequest,
  ): Promise<void> {
    return this.signUpService.signUp(body);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  verifyEmail(
    @Body({ schema: verifyEmailRequestSchema }) body: VerifyEmailRequest,
  ): Promise<void> {
    return this.signUpService.verifyEmail(body.token);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  resendVerification(
    @Body({ schema: resendVerificationRequestSchema })
    body: ResendVerificationRequest,
  ): Promise<void> {
    return this.signUpService.resendVerification(body.email);
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body({ schema: signInRequestSchema }) body: SignInRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Identity> {
    const { token, session } = await this.signInService.signIn(body, {
      address: request.ip ?? UNKNOWN_ADDRESS,
      userAgent: request.get('user-agent'),
    });
    this.cookie.set(response, token, session.expiresAt);
    return this.identityReader.describeUser(session.userId);
  }

  @Post('sign-out')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @CurrentPrincipal() principal: Principal,
    @CurrentSessionId() sessionId: string | null,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.signInService.signOut(requireUserSession(principal), sessionId);
    this.cookie.clear(response);
  }

  @Post('password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(
    @Body({ schema: passwordResetRequestSchema }) body: PasswordResetRequest,
  ): Promise<void> {
    return this.passwordReset.request(body.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  confirmPasswordReset(
    @Body({ schema: passwordResetConfirmRequestSchema })
    body: PasswordResetConfirmRequest,
  ): Promise<void> {
    return this.passwordReset.confirm(body);
  }
}
