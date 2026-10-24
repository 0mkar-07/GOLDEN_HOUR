import { z } from 'zod';
import { UserRole } from './enums.js';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
  hospitalId: z.string().nullable().optional(),
  ambulanceId: z.string().nullable().optional(),
  active: z.boolean(),
  createdAt: z.string(),
});

export type UserDto = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: UserSchema,
  message: z.string(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
