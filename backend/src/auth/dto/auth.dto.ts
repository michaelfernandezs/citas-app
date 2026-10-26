import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo no es válido' })
  email!: string;

  @IsString({ message: 'La contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;

  @IsString({ message: 'El nombre es requerido' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'El teléfono no es válido' })
  phone?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'El correo no es válido' })
  email!: string;

  @IsString({ message: 'La contraseña es requerida' })
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'El correo no es válido' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(64)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;
}
