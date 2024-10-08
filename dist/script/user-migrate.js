import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import csv from 'csv-parser';
import { PrismaClient, Role } from '@prisma/client';
import { nanoid } from 'nanoid';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient();
// const userMap: any = {};
// const pgConfig = {
//   host: 'localhost',
//   user: 'postgres',
//   password: 'kodakollectiv',
//   database: 'bitte-new',
//   port: 5434
// };
const restaurantType = await prisma.restaurantType.findMany({
    include: {
        restaurantTypeTranslation: true
    }
});
export async function userMigrate() {
    const results = [];
    const csvFilePath = path.join(__dirname, '../csv/users.csv');
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
        try {
            // Begin Prisma transaction
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
                    // Call the restaurant migration for each user (with old and new ID)
                    await restaurantMigrate(row.id, newUser.id, prisma);
                }
            });
            console.log('Data successfully inserted into PostgreSQL!');
        }
        catch (error) {
            console.error('Error inserting data:', error);
        }
        finally {
            await prisma.$disconnect();
        }
    });
}
async function getRestaurantType(resType) {
    if (resType) {
        for (const type of restaurantType) {
            const matchedType = type.restaurantTypeTranslation.find((translation) => translation.name.toLowerCase() === resType.toLowerCase());
            if (matchedType) {
                return type;
            }
        }
        return null;
    }
}
export async function restaurantMigrate(oldId, newId, prisma) {
    const results = [];
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
        }
        catch (error) {
            console.error('Error migrating restaurants:', error);
        }
    });
}
