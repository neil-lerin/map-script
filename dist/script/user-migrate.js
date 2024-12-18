import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import csv from 'csv-parser';
import { PrismaClient, Role } from '@prisma/client';
import { nanoid } from 'nanoid';
import * as bcrypt from 'bcrypt';
import { itemIngredient } from './item-ingredient.js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from "@aws-sdk/lib-storage";
import 'dotenv/config';
import mime from 'mime-types';
import axios from 'axios';
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION;
if (!accessKeyId || !secretAccessKey || !region) {
    throw new Error('Missing S3 configuration in environment variables');
}
const s3 = new S3Client({
    region,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
    forcePathStyle: true,
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const prisma = new PrismaClient({
    transactionOptions: {
        timeout: 60000000000,
        maxWait: 60000000000
    }
});
const restaurantType = await prisma.restaurantType.findMany({
    include: {
        restaurantTypeTranslation: true
    }
});
const serviceTypes = await prisma.serviceType.findMany();
const restoCsv = path.join(__dirname, '../csv/restaurants.csv');
const categoriesCsv = path.join(__dirname, '../csv/categories.csv');
const subcategoriesCsv = path.join(__dirname, '../csv/subcategories.csv');
const categoryitem = path.join(__dirname, '../csv/categoryitem.csv');
const itemCsv = path.join(__dirname, '../csv/items.csv');
const ingredientsCsv = path.join(__dirname, '../csv/ingredients.csv');
const itemIngredientsCsv = path.join(__dirname, '../csv/itemingredient.csv');
const restrictionsCsv = path.join(__dirname, '../csv/restrictions.csv');
const dietaryRestriction = path.join(__dirname, '../csv/dietaryrestrictions.csv');
const sidesCsv = path.join(__dirname, '../csv/sides.csv');
const csvFilePath = path.join(__dirname, '../csv/users.csv');
const menuItemMap = [];
const allIngredientMaps = [];
const allRestrictionsMaps = [];
const hashPass = await bcrypt.hash("password", 10);
export async function userMigrate() {
    const results = [];
    const allIngredientMaps = [];
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
        try {
            const transaction = await prisma.$transaction(async (prisma) => {
                let isFirstRestaurant = true;
                for (const row of results) {
                    const newUser = await prisma.user.create({
                        data: {
                            name: `${row.firstname} ${row.lastname}`,
                            role: row.isAdmin == 1 ? Role.ADMIN : Role.OWNER,
                            email: row.email,
                            isActive: true,
                            defaultLanguage: 'pt',
                            phoneNumber: row.mobile,
                            isVerified: true,
                            password: row.password
                        },
                    });
                    await restaurantMigrate(row.id, newUser.id, prisma);
                }
                // await itemIngredientMap(menuItemMap, allIngredientMaps, itemIngredientsCsv, prisma)
                // TODO: Uncomment
                // await dietaryRestrictionMap(menuItemMap, allRestrictionsMaps, dietaryRestriction, prisma)
                // await itemSideScript(menuItemMap, sidesCsv, prisma)
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
export async function restaurantMigrate(oldUserId, newUserId, prisma) {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(restoCsv)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
            try {
                const filteredRestaurants = results.filter(row => row.userId === oldUserId);
                let hasSelectedRestaurant = false;
                await Promise.all(filteredRestaurants.map(async (row) => {
                    const token = nanoid(12);
                    const resType = await getRestaurantType(row.cuisines);
                    const isSelected = !hasSelectedRestaurant;
                    hasSelectedRestaurant = true;
                    let image = null;
                    const randomName = nanoid(14);
                    const backgroundImageRandom = nanoid(14);
                    // TODO: Uncomment this
                    // if (row.logoImage !== 'NULL') {
                    //   image = await uploadBase64Image(row.logoImage, `restaurant/${randomName}`)
                    // }
                    let backgroundImage = null;
                    // TODO: Uncomment this
                    // if (row.bgImage !== 'NULL') {
                    //   const fullUrl = `https://api.joinbitte.com/${row.bgImage.trim()}`;
                    //   backgroundImage = await uploadFileToS3(fullUrl, backgroundImageRandom, 'theme')
                    // }
                    const newRes = await prisma.restaurant.create({
                        data: {
                            image,
                            name: row.name,
                            address: row.address,
                            token: token,
                            vat_number: row.VATNumber,
                            restaurantUsers: {
                                create: { userId: newUserId, isSelected: isSelected },
                            },
                            ...(row.cuisines && { restaurantTypeId: row.cuisines && resType?.id }),
                            theme: {
                                create: {
                                    facebookLink: row.facebookLink === 'NULL' ? null : row.facebookLink,
                                    instagramLink: row.instaLink === 'NULL' ? null : row.instaLink,
                                    tiktokLink: row.tiktokLink === 'NULL' ? null : row.tiktokLink,
                                    isImageBackground: row.bgImage !== 'NULL' ? false : true,
                                    menu_background: row.bgImage !== 'NULL' ? backgroundImage : null
                                },
                            },
                        },
                    });
                    const languagesArray = row.languages.split(',');
                    // await ingredientMigrate(row.id, newRes.id, newUserId, languagesArray, prisma)
                    await restricitonMigrate(row.id, newRes.id, newUserId, languagesArray, prisma);
                    await categoryMigrate(row.id, newRes.id, languagesArray, newUserId, prisma);
                }));
                console.log(`Restaurants for user ${newUserId} successfully migrated!`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating restaurants:', error);
                reject(error);
            }
        });
    });
}
export async function ingredientMigrate(oldRestoId, newRestoId, userId, languages, prisma) {
    const results = [];
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
                        }
                        else {
                            languages.forEach(lang => {
                                if (lang === 'pt') {
                                    translations.push({
                                        lang: 'pt',
                                        name: row.name,
                                    });
                                }
                                else if (lang === 'en') {
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
                    allIngredientMaps.push({ oldId: row.id, newId: newIngredient.id });
                }));
                console.log(`Ingredients added for resto ${newRestoId}`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating restaurants:', error);
                reject(error);
            }
        });
    });
}
export async function restricitonMigrate(oldRestoId, newRestoId, userId, languages, prisma) {
    const results = [];
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
                        }
                        else {
                            languages.forEach(lang => {
                                if (lang === 'pt') {
                                    translations.push({
                                        lang: 'pt',
                                        name: row.name,
                                    });
                                }
                                else if (lang === 'en') {
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
                    allRestrictionsMaps.push({ oldId: row.id, newId: newWarning.id });
                }));
                console.log(`Rescritcions added for resto ${newRestoId}`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating restaurants:', error);
                reject(error);
            }
        });
    });
}
export async function categoryMigrate(resOldId, resNewId, languages, newUserId, prisma) {
    const results = [];
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
                        }
                        else {
                            languages.forEach(lang => {
                                if (lang === 'pt') {
                                    translations.push({
                                        lang: 'pt',
                                        name: row.title,
                                        note: ''
                                    });
                                }
                                else if (lang === 'en' && row.title_ol !== 'NULL') {
                                    translations.push({
                                        lang: 'en',
                                        name: row.title_ol,
                                        note: ''
                                    });
                                }
                            });
                        }
                        // if (row.title_ol !== 'NULL') {
                        //   translations.push({
                        //     lang: 'en',
                        //     name: row.title_ol,
                        //     note: ''
                        //   });
                        // }
                    }
                    // let image = null
                    // const randomName = nanoid(14);
                    // if (row.catImage !== 'NULL') {
                    //   image = await uploadBase64Image(row.catImage, `category/${randomName}`)
                    // }
                    const newCategory = await prisma.category.create({
                        data: {
                            isActive: row.isActive == 1 ? true : false,
                            createdAt: new Date(row.createdAt),
                            updatedAt: new Date(row.updatedAt),
                            restaurantId: resNewId,
                            // image: image,
                            categoryTranslation: {
                                createMany: {
                                    data: translations.length > 0 ? translations : [],
                                },
                            },
                            position: parseInt(row.srOrder, 10) || 0,
                            deletedAt: row.isDeleted == 1 ? new Date() : null
                        },
                    });
                    // TODO
                    await subCategoryMigrate(row.id, newCategory.id, languages, resNewId, newUserId, prisma);
                    await categoryItem(row.id, newCategory.id, resNewId, languages, newUserId, prisma);
                }));
                console.log(`Categories for restaurant ${resNewId} successfully migrated!`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating categories:', error);
                reject(error);
            }
        });
    });
}
export async function subCategoryMigrate(oldCategoryId, newCategoryId, languages, resNewId, newUserId, prisma) {
    const results = [];
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
                        }
                        else {
                            languages.forEach(lang => {
                                if (lang === 'pt') {
                                    translations.push({
                                        lang: 'pt',
                                        name: row.title,
                                        note: ''
                                    });
                                }
                                else if (lang === 'en' && row.title_ol !== 'NULL') {
                                    translations.push({
                                        lang: 'en',
                                        name: row.title_ol,
                                        note: ''
                                    });
                                }
                            });
                        }
                        // if (row.title_ol !== 'NULL') {
                        //   translations.push({
                        //     lang: 'en',
                        //     name: row.title_ol,
                        //     note: ''
                        //   });
                        // }
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
                    await subcategoryItemMigrate(row.id, newSubCat.id, newCategoryId, languages, resNewId, newUserId, prisma);
                }));
                console.log(`Subcategories for category ${oldCategoryId} successfully migrated!`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating categories:', error);
                reject(error);
            }
        });
    });
}
export async function subcategoryItemMigrate(oldSubCategoryId, newSubCategoryId, newCategoryId, languages, restaurantId, newUserId, prisma) {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(itemCsv)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
            try {
                const filteredMenuItem = results.filter(row => row.subcategoryId === oldSubCategoryId);
                await Promise.all(filteredMenuItem.map(async (row) => {
                    const translations = [];
                    if (languages) {
                        if (languages.length > 0) {
                            if (languages.length === 1) {
                                const lang = languages[0];
                                translations.push({
                                    lang: lang,
                                    name: row.name,
                                    description: row.description
                                });
                            }
                            else {
                                languages.forEach(lang => {
                                    if (lang === 'pt') {
                                        translations.push({
                                            lang: 'pt',
                                            name: row.name,
                                            description: row.description
                                        });
                                    }
                                    else if (lang === 'en' && (row.name_ol !== 'NULL' && row.description_ol !== 'NULL')) {
                                        translations.push({
                                            lang: 'en',
                                            name: row.name_ol,
                                            description: row.description_ol
                                        });
                                    }
                                });
                            }
                            // if (row.name_ol !== 'NULL' && row.description_ol !== 'NULL') {
                            //   translations.push({
                            //     lang: 'en',
                            //     name: row.name_ol,
                            //     description: row.description_ol
                            //   });
                            // }
                        }
                    }
                    const randomName = nanoid(14);
                    let dishImages = [];
                    // TODO Uncomment this
                    // if (row.itemImage !== 'NULL') {
                    //   const imageUrls = row.itemImage.split(',');
                    //   await Promise.all(
                    //     imageUrls.map(async (imageUrl: string) => {
                    //       const fullUrl = `https://api.joinbitte.com/${imageUrl.trim()}`;
                    //       const itemKey = await uploadFileToS3(fullUrl, randomName, 'item');
                    //       if (itemKey !== null) {
                    //         dishImages.push(`item/${itemKey}`);
                    //       }
                    //     })
                    //   );
                    // }
                    const newItem = await prisma.menuItem.create({
                        data: {
                            dish_images: dishImages,
                            restaurantId: restaurantId,
                            isActive: row.isActive == 1 ? true : false,
                            position: parseInt(row.srOrder, 10) || 0,
                            isAvailable: row.availability == 1 ? true : false,
                            portionSize: parseInt(row.portionSize, 10).toString() || '0',
                            price: parseFloat(row.itemPrice) || 0.0,
                            calories: parseInt(row.calories, 10) || 0,
                            deletedAt: row.isDeleted == 1 ? new Date() : null,
                            categoryId: newCategoryId,
                            subCategoryId: newSubCategoryId,
                            serviceTypeId: serviceTypes.find(service => service.serviceEnum === 'DINE_IN')?.id,
                            menuItemServices: {
                                createMany: {
                                    data: serviceTypes.filter(service => service.serviceEnum !== 'DINE_IN').map(service => ({
                                        price: parseFloat(row.itemPrice) || 0.0,
                                        position: 0,
                                        serviceTypeId: service.id,
                                        categoryId: newCategoryId,
                                        restaurantId: restaurantId,
                                        subCategoryId: newSubCategoryId,
                                    }))
                                }
                            },
                            menuTranslations: {
                                createMany: {
                                    data: translations.length > 0 ? translations : [],
                                }
                            }
                        }
                    });
                    await itemIngredient(row.id, newItem.id, itemIngredientsCsv, newUserId, languages, ingredientsCsv, prisma);
                    menuItemMap.push({ oldId: row.id, newId: newItem.id });
                }));
                console.log(`Subcategory Item Migrated!`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating categories:', error);
                reject(error);
            }
        });
    });
}
export async function categoryItem(oldCategoryId, newCategoryId, restaurantId, languages, newUserId, prisma) {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(categoryitem)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
            try {
                const filteredCategoryItem = results.filter(row => row.categoryId === oldCategoryId);
                await Promise.all(filteredCategoryItem.map(async (row) => {
                    const item = await findItemInCsv(row.itemId);
                    if (item) {
                        const translations = [];
                        if (languages.length > 0) {
                            if (languages.length === 1) {
                                const lang = languages[0];
                                translations.push({
                                    lang: lang,
                                    name: item.name,
                                    description: item.description
                                });
                            }
                            else {
                                languages.forEach(lang => {
                                    if (lang === 'pt') {
                                        translations.push({
                                            lang: 'pt',
                                            name: item.name,
                                            description: item.description
                                        });
                                    }
                                    else if (lang === 'en' && (item.name_ol !== 'NULL' && item.description_ol !== 'NULL')) {
                                        translations.push({
                                            lang: 'en',
                                            name: item.name_ol,
                                            description: item.description_ol
                                        });
                                    }
                                });
                            }
                            // if (row.name_ol !== 'NULL' && row.description_ol !== 'NULL') {
                            //   translations.push({
                            //     lang: 'en',
                            //     name: item.name_ol,
                            //     description: item.description_ol
                            //   });
                            // }
                        }
                        const randomName = nanoid(14);
                        let dishImages = [];
                        // TODO: Uncomment this
                        // if (item.itemImage !== 'NULL') {
                        //   const imageUrls = item.itemImage.split(',');
                        //   await Promise.all(
                        //     imageUrls.map(async (imageUrl: string) => {
                        //       const fullUrl = `https://api.joinbitte.com/${imageUrl.trim()}`;
                        //       const itemKey = await uploadFileToS3(fullUrl, randomName, 'item');
                        //       if (itemKey !== null) {
                        //         dishImages.push(`item/${itemKey}`);
                        //       }
                        //     })
                        //   );
                        // }
                        const newItem = await prisma.menuItem.create({
                            data: {
                                dish_images: dishImages,
                                restaurantId: restaurantId,
                                isActive: item.isActive == 1 ? true : false,
                                position: parseInt(item.srOrder, 10) || 0,
                                isAvailable: item.availability == 1 ? true : false,
                                portionSize: parseInt(item.portionSize, 10).toString() || '0',
                                price: parseFloat(item.itemPrice) || 0.0,
                                calories: parseInt(item.calories, 10) || 0,
                                deletedAt: row.isDeleted == 1 ? new Date() : null,
                                categoryId: newCategoryId,
                                serviceTypeId: serviceTypes.find(service => service.serviceEnum === 'DINE_IN')?.id,
                                menuItemServices: {
                                    createMany: {
                                        data: serviceTypes.filter(service => service.serviceEnum !== 'DINE_IN').map(service => ({
                                            price: parseFloat(item.itemPrice) || 0.0,
                                            position: 0,
                                            serviceTypeId: service.id,
                                            categoryId: newCategoryId,
                                            restaurantId: restaurantId
                                        }))
                                    }
                                },
                                menuTranslations: {
                                    createMany: {
                                        data: translations.length > 0 ? translations : [],
                                    }
                                },
                            }
                        });
                        await itemIngredient(item.id, newItem.id, itemIngredientsCsv, newUserId, languages, ingredientsCsv, prisma);
                        menuItemMap.push({ oldId: item.id, newId: newItem.id });
                    }
                }));
                console.log(`Item for ${oldCategoryId} successfully migrated!`);
                resolve(true);
            }
            catch (error) {
                console.error('Error migrating item:', error);
                reject(error);
            }
        });
    });
}
export async function findItemInCsv(itemId) {
    return new Promise((resolve, reject) => {
        let foundItem = null;
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
async function uploadBase64Image(base64Image, key) {
    try {
        const cleanedBase64Image = base64Image
            .trim()
            .replace(/\s+/g, '')
            .replace(/^data:image\/\w+;base64,/, "");
        if (!cleanedBase64Image) {
            console.error('Invalid base64 data:', base64Image);
            return null;
        }
        const imageBuffer = Buffer.from(cleanedBase64Image, "base64");
        const mimeTypeMatch = base64Image.match(/data:(.*?);/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: `${key}`,
            Body: imageBuffer,
            ContentType: mimeType,
        };
        const command = new PutObjectCommand(uploadParams);
        await s3.send(command);
        return key;
    }
    catch (err) {
        console.error('Error uploading file:', err);
        return null;
    }
}
async function uploadFileToS3(filePath, key, folder) {
    try {
        const response = await axios({
            url: filePath,
            method: 'GET',
            responseType: 'stream'
        });
        if (response.status === 200) {
            const contentType = mime.lookup(filePath) || 'application/octet-stream';
            const upload = new Upload({
                client: s3,
                params: {
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: `${folder}/${key}`,
                    Body: response.data,
                    ContentType: contentType
                }
            });
            await upload.done();
            return key;
        }
        return null;
    }
    catch (err) {
        console.error('Error uploading file:', err);
        return null;
    }
}
