// Import required packages
const mysql = require('mysql2/promise');
const { Client } = require('pg');

// MySQL database configuration
const mysqlConfig = {
    host: 'localhost',
    user: 'root', // default MySQL user
    password: '', // provide the correct password
    database: 'sample', // your local MySQL database
    port: 3307 // default MySQL port
};

// PostgreSQL database configuration
const pgConfig = {
    host: 'localhost',
    user: 'postgres', // default PostgreSQL user
    password: 'kodakollectiv', // provide the correct password
    database: 'bitte', // your local PostgreSQL database
    port: 5432 // default PostgreSQL port
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

// Function to connect to both MySQL and PostgreSQL
async function connectDatabases() {
    try {
        // Connect to MySQL
        const mysqlConnection = await mysql.createConnection(mysqlConfig);
        console.log("Connected to MySQL!");

        // Query some data from MySQL
        const [mysqlRows] = await mysqlConnection.query('SELECT * FROM accounts');
        console.log("MySQL Data:", mysqlRows);

        // Connect to PostgreSQL
        const pgClient = new Client(pgConfig);
        await pgClient.connect();
        console.log("Connected to PostgreSQL!");

        // Query some data from PostgreSQL
        const pgRes = await pgClient.query('SELECT * FROM "User"');
        console.log("PostgreSQL Data:", pgRes.rows);

        // Close connections
        await mysqlConnection.end();
        await pgClient.end();
    } catch (error) {
        console.error('Error connecting to databases:', error);
    }
}

// Run the function to connect and query data
connectDatabases();
