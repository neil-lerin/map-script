// Import required packages
import { userMigrate } from './script/user-migrate.js';


// MySQL database configuration
const mysqlConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'sample',
    port: 3307
};

// PostgreSQL database configuration
const pgConfig = {
    host: 'localhost',
    user: 'postgres',
    password: 'kodakollectiv',
    database: 'bitte-new',
    port: 5434
};

const DATABASE_URL = 'postgres://postgres:e9866db2644496b6d126016b9ef0637b@dokku-postgres-bitte-db:5432/bitte_db';

// async function connectToPostgres() {
//     const client = new Client({
//         connectionString: DATABASE_URL,
//     });

//     try {
//         await client.connect();
//         console.log('Connected to PostgreSQL!');

//         // Perform your queries here
//         // const res = await client.query('SELECT NOW()'); // Example query
//         // console.log('Current Time:', res.rows[0]);

//         const mysql = await client.query('SELECT * from "User"');
//         console.log("MySQL Data:", mysql);
//     } catch (error) {
//         console.error('Error connecting to PostgreSQL:', error);
//     } finally {
//         await client.end();
//     }
// }

// connectToPostgres();

userMigrate()