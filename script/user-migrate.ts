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
const prisma = new PrismaClient({
  transactionOptions: {
    timeout: 600000
  }
});

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
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredRestaurants = results.filter(row => row.userId === oldId);
          await Promise.all(filteredRestaurants.map(async (row) => {
            const token = nanoid(12);
            const resType = await getRestaurantType(row.cuisines);

            const newRes = await prisma.restaurant.create({
              data: {
                name: row.name,
                address: row.address,
                token: token,
                vat_number: row.VATNumber,
                restaurantUsers: {
                  create: { userId: newId, isSelected: false },
                },
                ...(row.cuisines && { restaurantTypeId: row.cuisines && resType?.id }),
                theme: {
                  create: {
                    facebookLink: row.facebookLink,
                    instagramLink: row.instaLink,
                    tiktokLink: row.tiktokLink,
                  },
                },
              },
            });
            const languagesArray = row.languages.split(',');

            await categoryMigrate(row.id, newRes.id, languagesArray, prisma,);
          }));

          console.log(`Restaurants for user ${newId} successfully migrated!`);
          resolve(true);
        } catch (error) {
          console.error('Error migrating restaurants:', error);
          reject(error);
        }
      });
  });
}

export async function categoryMigrate(
  resOldId: string,
  resNewId: string,
  languages: Array<any>,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
) {
  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../csv/categories.csv');
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredCategories = results.filter(row => row.restaurantId === resOldId);
          await Promise.all(filteredCategories.map(async (row) => {
            const translations = [];

            if (languages.length > 0) {
              if (languages.length === 1) {
                const lang = languages[0];

                translations.push({
                  lang: lang,
                  name: row.title,
                  note: ''
                });
              } else {

                languages.forEach(lang => {
                  if (lang === 'pt') {
                    translations.push({
                      lang: 'pt',
                      name: row.title,
                      note: ''
                    });
                  } else if (lang === 'en') {
                    translations.push({
                      lang: 'en',
                      name: row.title_ol,
                      note: ''
                    });
                  }

                });
              }
            }
            const newCategory = await prisma.category.create({
              data: {
                isActive: row.isActive == 1 ? true : false,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt),
                restaurantId: resNewId,
                categoryTranslation: {
                  createMany: {
                    data: translations.length > 0 ? translations : [],
                  },
                },
                position: parseInt(row.srOrder, 10) || 0,
                deletedAt: row.isDeleted == 1 ? new Date() : null
              },
            });
            subCategoryMigrate(row.id, newCategory.id, languages, resNewId, prisma)
          }));
          console.log(`Categories for restaurant ${resNewId} successfully migrated!`);
          resolve(true);
        } catch (error) {
          console.error('Error migrating categories:', error);
          reject(error);
        }
      });
  });
}

export async function subCategoryMigrate(
  oldCategoryId: string,
  newCategoryId: string,
  languages: Array<any>,
  resNewId: string,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,

) {
  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../csv/subcategories.csv');
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredCategories = results.filter(row => row.categoryId === oldCategoryId);
          await Promise.all(filteredCategories.map(async (row) => {
            const translations = [];

            if (languages.length > 0) {
              if (languages.length === 1) {
                const lang = languages[0];

                translations.push({
                  lang: lang,
                  name: row.title,
                  note: ''
                });
              } else {

                languages.forEach(lang => {
                  if (lang === 'pt') {
                    translations.push({
                      lang: 'pt',
                      name: row.title,
                      note: ''
                    });
                  } else if (lang === 'en') {
                    translations.push({
                      lang: 'en',
                      name: row.title_ol,
                      note: ''
                    });
                  }

                });
              }
            }
            await prisma.category.create({
              data: {
                isActive: row.isActive == 1 ? true : false,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt),
                restaurantId: resNewId,
                categoryId: newCategoryId,
                categoryTranslation: {
                  createMany: {
                    data: translations.length > 0 ? translations : [],
                  },
                },
                position: parseInt(row.srOrder, 10) || 0,
                deletedAt: row.isDeleted == 1 ? new Date() : null
              },
            });
          }));

          console.log(`Subcategories for category ${oldCategoryId} successfully migrated!`);
          resolve(true);
        } catch (error) {
          console.error('Error migrating categories:', error);
          reject(error);
        }
      });
  });
}