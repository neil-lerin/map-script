
import { PrismaClient } from '@prisma/client';
import { userMigrate } from './script/user-migrate.js';


// const prisma = new PrismaClient();


// const serviceType = await prisma.serviceType.findMany()
// serviceType.filter(service => service.serviceEnum !== 'DINE_IN').map(service => console.log(service.name))
userMigrate()