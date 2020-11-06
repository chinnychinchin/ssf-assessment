//Load required libraries 
const express = require('express');
const handlebars = require('express-handlebars');
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');
const withQuery = require('with-query').default;

//configure port
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;

//initiate express and load handlebars 
const app = express();
app.engine('hbs', handlebars({defaultLayout: 'default.hbs'}));
app.set('view engine','hbs');

//SQL queries
const alphabets = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split('');
const SQL_GET_BOOKS_BY_LETTER = "select title, book_id from book2018 where title like ? limit ? offset ?"
const SQL_GET_COUNT = "select count(*) as count from book2018 where title like ?"
const SQL_GET_BOOK_BY_ID = "select * from book2018 where book_id = ?"


//create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'goodreads',
    connectionLimit: 4,
    timezone: '+08:00'
});

//Configure API requests
const API_KEY = process.env.API_KEY || "";
const ENDPOINT = 'https://api.nytimes.com/svc/books/v3/reviews.json';
const searchParams = (title) => {return { "api-key": API_KEY, title }} 
const searchReview = async (title) => {
    const url = withQuery(ENDPOINT, searchParams(title));
    const result = await fetch(url);
    const resultJSON = await result.json();
    return resultJSON
} 

//Start server 
pool.getConnection().then(conn => {

    const p0 = conn.ping(); //returns a promise
    console.log('>>> Pinging database...')
    const p1 = Promise.resolve(conn);
    app.listen(PORT, () => {console.log(`Your application has started on port ${PORT} at ${new Date()}`)});
    return Promise.all([p0,p1]);
}).then(result =>{ 
    const conn = result[1];
    conn.release();
}).catch(e => console.log(`Cannot ping database, ${e}`))


//Configure routes
app.get('/', (req,res) => {

    try{    
        res.status(200);
        res.type('text/html');
        res.render('landingPage', {alphabets});
     }
    catch(e){
        res.status(404);
        res.type('text/html');
        res.send(`Error: 404: ${e}`)
    }

})

app.get('/books', async (req,res) => {

    let offset = parseInt(req.query.offset) || 0;
    const limit = 10;
    const conn = await pool.getConnection();
    let letter = req.query['startLetter'];
    let startLetter = `${letter}%`;
    console.log(req.query)

    try{
        const [books,_] = await conn.query(SQL_GET_BOOKS_BY_LETTER,[startLetter,limit,offset]); //books = [{title: A, book_id},{}...]
        const [count,__] = await conn.query(SQL_GET_COUNT,[startLetter]);
        const totalShows = count[0].count
        res.status(200);
        res.type('text/html');
        res.render('bookTitles',{letter,books,prevOffset: Math.max(0,(offset-limit)),nextOffset: Math.min(totalShows,(offset+limit))});

    }catch(e){

        res.status(500);
        res.type('text/html');
        res.send(`Error: 500: ${e}`)

    }finally{
        conn.release();
    }

} )


app.get('/books/:id', async (req,res) => {

    const conn = await pool.getConnection();
    const book_id = req.params.id;
    
    try{
        const [result,_] = await conn.query(SQL_GET_BOOK_BY_ID,[book_id]);
        const bookDetails = result[0];
        const {title, authors, pages, rating, rating_count, genres, image_url, description} = bookDetails;
        res.status(200);
        res.type('text/html');
        res.render('bookDetails', {title, image_url, description, rating, rating_count, authors, pages, genres})
    }
    catch(e){
        res.status(500);
        res.type('text/html');
        res.send(`Error: 500: ${e}`)
    }
    finally{
        conn.release()
    }

})


//Reviews route
app.get('/reviews/:title', async (req, res) => {

    const title = req.params.title;
    try {

        const result = await searchReview(title);
        console.log(result);
        res.status(200);
        res.type('text/html');
        res.render('reviewsPage')

    }catch(e){
        res.status(404);
        res.type('text/html');
        res.send(`Error 404: ${e}`)
    }

})


