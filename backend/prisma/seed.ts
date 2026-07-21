import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@clinica.com';
  const password = process.env.ADMIN_PASSWORD || 'CambiaEstaPassword123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`El admin ${email} ya existe, no se crea de nuevo.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, passwordHash, name: 'Administrador', role: 'ADMIN' },
  });

  console.log(`Admin creado: ${email} / ${password}`);
  console.log('IMPORTANTE: cambia esta contraseña después del primer login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
