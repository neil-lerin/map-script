import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import csv from 'csv-parser';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { nanoid } from 'nanoid';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { itemIngredientMap } from './item-ingredient-map.js';
import { dietaryRestrictionMap } from './dietary-restrictions-map.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient({
  transactionOptions: {
    timeout: 6000000,
    maxWait: 6000000
  }
});

const restaurantType = await prisma.restaurantType.findMany({
  include: {
    restaurantTypeTranslation: true
  }
})
const restoCsv = path.join(__dirname, '../csv/restaurants.csv');
const categoriesCsv = path.join(__dirname, '../csv/categories.csv');
const subcategoriesCsv = path.join(__dirname, '../csv/subcategories.csv');
const categoryitem = path.join(__dirname, '../csv/categoryitem.csv');
const itemCsv = path.join(__dirname, '../csv/items.csv');
const ingredientsCsv = path.join(__dirname, '../csv/ingredients.csv');
const itemIngredientsCsv = path.join(__dirname, '../csv/itemingredient.csv');
const restrictionsCsv = path.join(__dirname, '../csv/restrictions.csv');
const dietaryRestriction = path.join(__dirname, '../csv/dietaryrestrictions.csv');
const menuItemMap: Array<{
  oldId: string,
  newId: string
}> = [];

const allIngredientMaps: Array<{
  oldId: string,
  newId: string
}> = [];

const allRestrictionsMaps: Array<{
  oldId: string,
  newId: string
}> = [];

export async function userMigrate() {
  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../csv/users.csv');
  // const allIngredientMaps: { oldId: string; newId: string }[] = [];
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
          await itemIngredientMap(menuItemMap, allIngredientMaps, itemIngredientsCsv, prisma)
          await dietaryRestrictionMap(menuItemMap, allRestrictionsMaps, dietaryRestriction, prisma)
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
  oldUserId: string,
  newUserId: string,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
) {
  const results: any[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(restoCsv)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredRestaurants = results.filter(row => row.userId === oldUserId);
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
                  create: { userId: newUserId, isSelected: false },
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
            await ingredientMigrate(row.id, newRes.id, newUserId, languagesArray, prisma)
            await restricitonMigrate(row.id, newRes.id, newUserId, languagesArray, prisma)
            await categoryMigrate(row.id, newRes.id, languagesArray, prisma,);
          }));

          console.log(`Restaurants for user ${newUserId} successfully migrated!`);
          resolve(true)
        } catch (error) {
          console.error('Error migrating restaurants:', error);
          reject(error);
        }
      });
  });
}

export async function ingredientMigrate(
  oldRestoId: string,
  newRestoId: string,
  userId: string,
  languages: Array<any>,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
) {
  const results: any[] = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(ingredientsCsv)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredIngredients = results.filter(row => row.restaurantId === oldRestoId);
          await Promise.all(filteredIngredients.map(async (row) => {
            const translations = [];

            if (languages.length > 0) {
              if (languages.length === 1) {
                const lang = languages[0];

                translations.push({
                  lang: lang,
                  name: row.name,
                });
              } else {
                languages.forEach(lang => {
                  if (lang === 'pt') {
                    translations.push({
                      lang: 'pt',
                      name: row.name,
                    });
                  } else if (lang === 'en') {
                    translations.push({
                      lang: 'en',
                      name: row.name_ol,
                    });
                  }

                });
              }
            }
            const newIngredient = await prisma.ingredient.create({
              data: {
                isGlobal: false,
                userId: userId,
                ingredientTranslation: {
                  createMany: {
                    data: translations.length > 0 ? translations : [],
                  },
                },
              },
            });
            allIngredientMaps.push({ oldId: row.id, newId: newIngredient.id })
          }));

          console.log(`Ingredients added for resto ${newRestoId}`);
          resolve(true);
        } catch (error) {
          console.error('Error migrating restaurants:', error);
          reject(error);
        }
      });
  })
}

export async function restricitonMigrate(
  oldRestoId: string,
  newRestoId: string,
  userId: string,
  languages: Array<any>,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
) {
  const results: any[] = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(restrictionsCsv)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredResctrictions = results.filter(row => row.restaurantId === oldRestoId);

          await Promise.all(filteredResctrictions.map(async (row) => {
            const translations = [];

            if (languages.length > 0) {
              if (languages.length === 1) {
                const lang = languages[0];

                translations.push({
                  lang: lang,
                  name: row.name,
                });
              } else {
                languages.forEach(lang => {
                  if (lang === 'pt') {
                    translations.push({
                      lang: 'pt',
                      name: row.name,
                    });
                  } else if (lang === 'en') {
                    translations.push({
                      lang: 'en',
                      name: row.name_ol,
                    });
                  }

                });
              }
            }
            const newWarning = await prisma.deitaryWarning.create({
              data: {
                isGlobal: false,
                userId: userId,
                dietaryWarningTranslation: {
                  createMany: {
                    data: translations.length > 0 ? translations : [],
                  },
                }
              },
            });
            allRestrictionsMaps.push({ oldId: row.id, newId: newWarning.id })
          }));
          console.log(`Rescritcions added for resto ${newRestoId}`);
          resolve(true);
        } catch (error) {
          console.error('Error migrating restaurants:', error);
          reject(error);
        }
      });
  })
}


export async function categoryMigrate(
  resOldId: string,
  resNewId: string,
  languages: Array<any>,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
) {
  const results: any[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(categoriesCsv)
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
            await subCategoryMigrate(row.id, newCategory.id, languages, resNewId, resOldId, prisma)
            await categoryItem(row.id, newCategory.id, resNewId, languages, resOldId, prisma)
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
  resOldId: string,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
) {
  const results: any[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(subcategoriesCsv)
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
            const newSubCat = await prisma.category.create({
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
            await subcategoryItemMigrate(row.id, newSubCat.id, newCategoryId, languages, resNewId, resOldId, prisma)
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

export async function subcategoryItemMigrate(
  oldSubCategoryId: string,
  newSubCategoryId: string,
  newCategoryId: string,
  languages: Array<any>,
  restaurantId: string,
  resOldId: string,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
) {
  const results: any[] = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(itemCsv)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredMenuItem = results.filter(row => row.subcategoryId === oldSubCategoryId);



          await Promise.all(filteredMenuItem.map(async (row) => {
            const translations: any = [];

            if (languages) {

              if (languages.length > 0) {
                if (languages.length === 1) {
                  const lang = languages[0];

                  translations.push({
                    lang: lang,
                    name: row.name,
                    description: row.description
                  });
                } else {

                  languages.forEach(lang => {
                    if (lang === 'pt') {
                      translations.push({
                        lang: 'pt',
                        name: row.name,
                        description: row.description
                      });
                    } else if (lang === 'en') {
                      translations.push({
                        lang: 'en',
                        name: row.name_ol,
                        description: row.description_ol
                      });
                    }

                  });
                }
              }
            }
            const newItem = await prisma.menuItem.create({
              data: {
                dish_images: [],
                restaurantId: restaurantId,
                isActive: row.isActive == 1 ? true : false,
                position: parseInt(row.srOrder, 10) || 0,
                isAvailable: row.availability == 1 ? true : false,
                portionSize: parseInt(row.portionSize, 10) || 0,
                price: parseFloat(row.itemPrice) || 0.0,
                calories: parseInt(row.calories, 10) || 0,
                deletedAt: row.isDeleted == 1 ? new Date() : null,
                categoryId: newCategoryId,
                subCategoryId: newSubCategoryId,
                menuTranslations: {
                  createMany: {
                    data: translations.length > 0 ? translations : [],
                  }
                }
              }
            })
            menuItemMap.push({ oldId: row.id, newId: newItem.id })
          }));
          console.log(`Subcategory Item Migrated!`);
          resolve(true);
        } catch (error) {
          console.error('Error migrating categories:', error);
          reject(error);
        }
      });
  })
}


export async function categoryItem(
  oldCategoryId: string,
  newCategoryId: string,
  restaurantId: string,
  languages: Array<any>,
  resOldId: string,
  prisma: Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
) {
  const results: any[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(categoryitem)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const filteredCategoryItem = results.filter(row => row.categoryId === oldCategoryId);


          await Promise.all(filteredCategoryItem.map(async (row) => {
            const item = await findItemInCsv(row.itemId)

            if (item) {
              const translations: any = [];
              if (languages.length > 0) {
                if (languages.length === 1) {
                  const lang = languages[0];

                  translations.push({
                    lang: lang,
                    name: item.name,
                    description: item.description
                  });
                } else {

                  languages.forEach(lang => {
                    if (lang === 'pt') {
                      translations.push({
                        lang: 'pt',
                        name: item.name,
                        description: item.description
                      });
                    } else if (lang === 'en') {
                      translations.push({
                        lang: 'en',
                        name: item.name_ol,
                        description: item.description_ol
                      });
                    }

                  });
                }
              }
              const newItem = await prisma.menuItem.create({
                data: {
                  dish_images: [],
                  restaurantId: restaurantId,
                  isActive: item.isActive == 1 ? true : false,
                  position: parseInt(item.srOrder, 10) || 0,
                  isAvailable: item.availability == 1 ? true : false,
                  portionSize: parseInt(item.portionSize, 10) || 0,
                  price: parseFloat(item.itemPrice) || 0.0,
                  calories: parseInt(item.calories, 10) || 0,
                  deletedAt: row.isDeleted == 1 ? new Date() : null,
                  categoryId: newCategoryId,
                  menuTranslations: {
                    createMany: {
                      data: translations.length > 0 ? translations : [],
                    }
                  }
                }
              })
              menuItemMap.push({ oldId: item.id, newId: newItem.id })
            }
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

export async function findItemInCsv(itemId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let foundItem: any = null;

    const stream = fs.createReadStream(itemCsv)
      .pipe(csv());

    stream
      .on('data', (row) => {

        if (row.id === itemId) {
          foundItem = row;
          stream.pause();
          resolve(foundItem);
        }
      })
      .on('end', () => {
        if (!foundItem) {
          console.error(`Item with ID ${itemId} not found`);
          reject(`Item with ID ${itemId} not found`);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        reject(error);
      });
  });
}

