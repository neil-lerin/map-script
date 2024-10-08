import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import csv from 'csv-parser';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { nanoid } from 'nanoid';
import { DefaultArgs } from '@prisma/client/runtime/library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient();

const restaurantType = await prisma.restaurantType.findMany({
  include: {
    restaurantTypeTranslation: true
  }
})

export async function userMigrate() {
  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../csv/users.csv');

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        const transaction = await prisma.$transaction(async (prisma) => {
          for (const row of results) {
            const newUser = await prisma.user.create({
              data: {
                name: `${row.firstname} ${row.lastname}`,
                role: row.isAdmin == 1 ? Role.ADMIN : Role.OWNER,
                email: row.email,
                isActive: true,
                defaultLanguange: row.userLanguage,
                phoneNumber: row.mobile,
                isVerified: true,
                password: row.password
              },
            });

            await restaurantMigrate(row.id, newUser.id, prisma);
          }
        });

        console.log('Data successfully inserted into PostgreSQL!');
      } catch (error) {
        console.error('Error inserting data:', error);
      } finally {
        await prisma.$disconnect();
      }
    });
}

async function getRestaurantType(resType: string) {
  if (resType) {
    for (const type of restaurantType) {
      const matchedType = type.restaurantTypeTranslation.find(
        (translation) => translation.name.toLowerCase() === resType.toLowerCase()
      );

      if (matchedType) {
        return type;
      }
    }

    return null;
  }
}

export async function restaurantMigrate(
  oldId: string,
  newId: string,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
) {
  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../csv/restaurants.csv');
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        const filteredRestaurants = results.filter(row => row.userId === oldId);

        for (const row of filteredRestaurants) {
          const token = nanoid(12);
          const resType = await getRestaurantType(row.cuisines);

          await prisma.restaurant.create({
            data: {
              name: row.name,
              address: row.address,
              token: token,
              vat_number: row.VATNumber,
              restaurantUsers: {
                create: { userId: newId, isSelected: false }
              },
              ...(row.cuisines && { restaurantTypeId: row.cuisines && resType?.id }),
              theme: {
                create: {
                  facebookLink: row.facebookLink,
                  instagramLink: row.instaLink,
                  tiktokLink: row.tiktokLink
                }
              }
            },
          });
        }

        console.log(`Restaurants for user ${newId} successfully migrated!`);
      } catch (error) {
        console.error('Error migrating restaurants:', error);
      }
    });
}