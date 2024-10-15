import fs from 'fs';
import csv from 'csv-parser';
export async function findIngredient(itemId, ingredientsCsv) {
    return new Promise((resolve, reject) => {
        let foundItem = null;
        const stream = fs.createReadStream(ingredientsCsv)
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
