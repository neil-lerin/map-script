import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import csv from 'csv-parser';
import pg from 'pg';
import { PrismaClient, Role } from '@prisma/client';
import { nanoid } from 'nanoid';
const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient();
const userMap = {};
const pgConfig = {
    host: 'localhost',
    user: 'postgres',
    password: 'kodakollectiv',
    database: 'bitte-new',
    port: 5434
};
const pgClient = new Client(pgConfig);
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
export async function restaurantMigrate(oldId, newId, prisma) {
    const results = [];
    const csvFilePath = path.join(__dirname, '../csv/restaurants.csv');
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
        try {
            // Batch processing to reduce individual DB inserts
            const filteredRestaurants = results.filter(row => row.userId === oldId);
            for (const row of filteredRestaurants) {
                const token = nanoid(12);
                // Use Prisma to insert restaurants for the given user
                await prisma.restaurant.create({
                    data: {
                        name: row.name,
                        address: row.address,
                        token: token,
                        vat_number: row.VATNumber,
                        restaurantUsers: {
                            create: { userId: newId, isSelected: false }
                        },
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
