const express = require('express');
const history = require('connect-history-api-fallback');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mariadb = require('mariadb');
const app = express();

app.use(cookieParser("TajemniczyCiągZnaków"));
app.use(bodyParser.urlencoded({extended:true}));
app.use(history());
app.use(bodyParser.json());

const pool = mariadb.createPool({
    host: 'localhost',
    user: 'lnkoc',
    password: 'lnkoc',
    database: 'blogdb',
    connectionLimit: 5
});


// Funkcja generująca token

function getToken() {
    let time = new Date();
    return "token" + time.getFullYear() * (time.getDate() + 1) * (time.getMilliseconds() + 1);
}


// funkcja sprwdzająca ciasteczko sesji

async function cookieCheck(req) {

    let cookie = req.signedCookies["session"];
    let confirm;

    if (cookie) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "SELECT (NOW() - (SELECT DATE FROM USER_SESSION)) AS AGE FROM USER_SESSION WHERE TOKEN='" + cookie + "';";
            const result = await conn.query(sql);
            if (result.length == 1) {

                if (result[0].AGE < 3000) {
                    confirm = true;

                }
                else {

                    confirm = false;
                }
            }
            else {

                confirm = false;
            }
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        confirm = false;
    }
    
    return confirm;
}


// Sprawdzenie poprawności pierwszej i ostatniej litery hasła. Wysłanie ciasteczka w przypadku poprawności.

app.get('/loginFirst', async (req, res) => {

    let data = req.query;

    if (req.signedCookies["shortSession"] === undefined) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "SELECT USER, PASSWORD FROM USER_SESSION WHERE USER='" + data.login + "';";
            const result = await conn.query(sql);

            if (result.length == 1) {

                let pass = result[0].PASSWORD;
                let first = pass[0];
                let last = pass[pass.length - 1];

                if ((data.first === first) && (data.last === last)) {

                    let options = {
                        maxAge: 1000 * 5, // 5 sekund na przesłanie poprawnych danych
                        httpOnly: true,
                        signed: true
                    }

                    console.log("loginFirst dane poprawne")
                    res.cookie('shortSession', "one two three", options);
                    res.status(200).end(); 
                }
                else {

                    res.status(401).send("BRAK AUTORYZACJI")
                }          
            }
            else {

                res.status(401).send("BRAK AUTORYZACJI")
            }
        }
        catch (err) {

            console.log(err);
            throw(err);
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        if (req.signedCookies["shortSession"] == "one two three") {

            res.status(400).end("SERWER CHWILOWO NIEDOSTĘPNY");
        }
    }
});


// Sprawdzenie poprawności całego hasła, przesłaie ciasteczka i pierwszego tokenu umożliwiającego aktualizację sesji

app.get('/getToken', async (req, res) => {

    if (req.signedCookies["shortSession"] == "one two three") {

        let data = req.query;
        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "SELECT USER, MD5(PASSWORD) AS PASSWORDMD5 FROM USER_SESSION WHERE USER='" + data.login + "';";
            const result = await conn.query(sql);

            if (result.length == 1) {

                let pass = result[0].PASSWORDMD5;

                if (pass == data.pass) {

                    let token = getToken();
                    let sql2 = "UPDATE USER_SESSION SET DATE=(SELECT NOW()), TOKEN='" + token + "' WHERE USER='" + data.login + "';";
                    const result2 = await conn.query(sql2);
                    let options = {
                        maxAge: 1000 * 60 * 30,
                        httpOnly: true,
                        signed: true
                    }

                    res.cookie('session', token, options);
                    res.send(token);
                    console.log("getToken nadany token " + token);
                }
                else {

                    res.status(401).send("Brak autoryzacji");
                }
            }
            else {

                res.status(401).send("Brak autoryzacji");
            }
        }
        catch (err) {

            throw (err);
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        res.status(401).send("Brak autoryzacji");
    }
});


// walidacja i aktualizacja tokenu i ciasteczka

app.get('/validateToken', async (req, res) => {

    let conn;
    let reqToken = req.query.token; 

    if (await cookieCheck(req)) {
        
        try {

            conn = await pool.getConnection();
            let sql = "SELECT (NOW() - (SELECT DATE FROM USER_SESSION)) AS AGE, TOKEN FROM USER_SESSION  WHERE TOKEN='" + reqToken + "';";
            let result = await conn.query(sql);

            if (result.length === 1) {
    
                if (result[0].AGE < 1000) {
 
                    let token = getToken();
                    let sql2 = "UPDATE USER_SESSION SET DATE = (SELECT NOW()), TOKEN='" + token + "' WHERE TOKEN='" + reqToken + "';";
                    let result2 = await conn.query(sql2);
                    let options = {
                        maxAge: 1000 * 60 * 10,
                        httpOnly: true,
                        signed: true
                    }
                    res.cookie('session', token, options);
                    res.send(token);
                }
                else {

                    res.status(408)    
                }
            }
            else {
    
                res.status(400)
            }
        }
        catch (err) {
    
            throw err
        }
        finally {
    
            if (conn) conn.end();
        }
    }
    else {

        res.status(401);
    }

    

})


// poprawne wylogowanie

app.get('/logout', async (req, res) => {

    let usedToken = req.query.token;
    let cookie = req.signedCookies['session'];

    if (cookie === usedToken) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "UPDATE USER_SESSION SET DATE=NULL, TOKEN=NULL WHERE TOKEN='" + cookie + "';";
            const response = await conn.query(sql);
            console.log("poprawnie wylogowano");
        }
        catch (err) {

            console.log(err);
            throw(err);
        }
        finally {

            if (conn) conn.end();
        }
    }
    res.end();
})


// wysyłanie niezatwierdzonych komentarzy

app.post('/getUndoneComments', async (req, res) => {

    if (await cookieCheck(req)) {
    
        let conn;
    
        try {
    
            conn = await pool.getConnection();
            let sql = "SELECT ARTICLES.TITLE, ARTICLES.INTRO, COMMENTS.ID, COMMENTS.NICKNAME, COMMENTS.CREATED, COMMENTS.CONTENT FROM ARTICLES, COMMENTS WHERE COMMENTS.ARTICLE_ID=ARTICLES.ID AND COMMENTS.APPROVED='0' AND COMMENTS.TRASH='0' ORDER BY TITLE, ID;";
            const result = await conn.query(sql);
            res.send(result);
            console.log("poprawnie wysłano niezatwierdzone komentarze");
        }
        catch (err) {
    
            throw err;
        }
        finally {
    
            if (conn) conn.end();
        }
    }
    else {

        res.status(401);
    }
})


// zatwierdzenie komentarza

app.get('/confirmComment', async (req, res) => {

    if (await cookieCheck(req)) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "UPDATE COMMENTS SET APPROVED='1' WHERE ID='" + req.query.commentId + "';";
            const result = conn.query(sql);
            res.status(200).send("Zatwierdzono komentarz");
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        res.status(401);
    }
})


// przeniesienie komentarza do kosza

app.get('/denyComment', async (req, res) => {

    if (await cookieCheck(req)) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "UPDATE COMMENTS SET TRASH='1' WHERE ID='" + req.query.commentId + "';";
            const result = conn.query(sql);
            res.status(200).send("Przeniesiono komentarz");
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        res.status(401);
    }
})


// usunięcie komentarza

app.get('/deleteComment', async (req, res) => {

    if (await cookieCheck(req)) {

        let conn;
        try {

            conn = await pool.getConnection();
            let sql = "DELETE FROM COMMENTS WHERE ID='" + req.query.commentId + "';";
            const result = conn.query(sql);
            res.status(200).send("Usunięto komentarz");
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end;
        }
    }
    else {
        res.status(401);
    }
})


// wysyłanie komentarzy w koszu

app.post('/getBinComments', async (req, res) => {

    if (await cookieCheck(req)) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "SELECT ARTICLES.TITLE, ARTICLES.INTRO, COMMENTS.ID, COMMENTS.NICKNAME, COMMENTS.CREATED, COMMENTS.CONTENT FROM ARTICLES, COMMENTS WHERE COMMENTS.TRASH='1' AND COMMENTS.ARTICLE_ID=ARTICLES.ID;";
            const result = await conn.query(sql);
            res.send(result);
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        res.status(401);
    }
})

// przywrócenie komentarza z kosza

app.get('/restoreComment', async (req, res) => {

    if (await cookieCheck(req)) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "UPDATE COMMENTS SET TRASH='0' WHERE ID='" + req.query.commentId + "';";
            const result = await conn.query(sql);
            res.status(200).send("Przywrócono komentarz");
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {
        
        res.status(401);
    }
})


// dodanie wpisu

app.post('/saveArticle', async (req, res) => {

    let article = req.body.params;

    if( await cookieCheck(req) ) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "INSERT INTO ARTICLES (TITLE, INTRO, CONTENT, CREATED) VALUES ('" + article.title + "', '" + article.intro + "', '" + article.content + "', (SELECT CURRENT_DATE()));";
            const result = await conn.query(sql);
        }
        catch (err) {

            throw err;
        }
        finally {
            
            if (conn) conn.end();
        }
        res.status(200).send("Dodano wpis");

    }
    else {
        res.status(401);
    }
})


// wysłanie listy wpisów

app.get('/getArticlesList', async (req, res) => {

    if (await cookieCheck(req)) {
    
        let conn;
    
        try {
    
            conn = await pool.getConnection();
            let sql = "SELECT ID, TITLE, CREATED, INTRO FROM ARTICLES ORDER BY ID DESC;";
            const result = await conn.query(sql);
            res.status(200).send(result);
        }
        catch (err) {
    
            throw err;
        }
        finally {
    
            if (conn) conn.end();
        }

    } else {

        res.status(401).send("Brak autoryzacji");
    }
})


// wysłanie artykułu

app.post('/getArticle', async (req, res) => {  

    if (await cookieCheck(req)) {

        let conn;

        try {

            conn = await pool.getConnection();
            let sql = "SELECT TITLE, INTRO, CONTENT, CREATED FROM ARTICLES WHERE ID = '" + req.body.params.id +"';";
            const result = await conn.query(sql);
            res.status(200).send(result);
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        res.status(401).send("Brak autoryzacji");
    }   
})


// usunięcie wpisu 
// TODO rozwiązać problem komentarzy do wpisu
app.post('/deleteArticle', async (req, res) => {

    if(await cookieCheck(req)) {
        
        let conn;
        
        try {
        
            conn = await pool.getConnection();
            let sql = "DELETE FROM ARTICLES WHERE ID = '" + req.body.params.id + "';";
            const result = await conn.query(sql);
            res.status(200).send("Skasowano wpis");
        }
        catch (err) {
        
            throw err;
        }
        finally {
            if (conn) conn.end();
        }
    }
    else {

        res.status(401).send("Brak autoryzacji");
    }
})


// aktualizacja wpisu

app.post('/updateArticle', async (req, res) => {

    if (await cookieCheck(req)) {
        
        let conn;
        
        try {

            conn = await pool.getConnection();
            let sql = "UPDATE ARTICLES SET TITLE = '" + req.body.params.title + "', INTRO = '" + req.body.params.intro + "', CONTENT = '" + req.body.params.content + "' WHERE ID = '" + req.body.params.id + "';";
            const result = await conn.query(sql);
            res.status(200).send("Zaktualizowano");
        }
        catch (err) {

            throw err;
        }
        finally {

            if (conn) conn.end();
        }
    }
    else {

        res.status(401).send("Brak autoryzacji");
    }    
})


// wysłanie listy komentarzy 

app.post('/getComments', async (req, res) => {

    let articleId = req.body.params.articleId;
    let conn;
    
    try {
    
        conn = await pool.getConnection();
        let sql = "SELECT CREATED, NICKNAME, CONTENT, ID FROM COMMENTS WHERE APPROVED='1' AND TRASH='0' AND ARTICLE_ID='" + articleId + "' ORDER BY ID;";
        const result = await conn.query(sql);
        res.status(200).send(result);
    }
    catch (err) {

        throw err;
    }
    finally {

        if (conn) conn.end();
    }
})


// wysłanie listy wpisów

app.get('/getBlogList', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        let sql = "SELECT ID, TITLE, INTRO, CREATED FROM ARTICLES ORDER BY ID DESC;";
        const result = await conn.query(sql);
        res.send(result);
    }
    catch (err) {
        console.log(err);
        throw err;
    }
    finally {
        if (conn) conn.end();
    }
})


// wysłanie wpisu

app.get('/getBlogArticle', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        let sql = "SELECT TITLE, CREATED, INTRO, CONTENT FROM ARTICLES WHERE ID = '" + req.query.ID + "';";
        const result = await conn.query(sql);
        res.send(result);
    }
    catch (err){
        console.log(err);
        throw err;
    }
    finally {
        if (conn) conn.end();
    }
})


// zapisanie komentarza

app.post('/saveComment', async (req, res) => {
    let comment = req.body.params;
    let conn;
    try {

        conn = await pool.getConnection();
        let sql = "INSERT INTO COMMENTS (ARTICLE_ID, NICKNAME, CREATED, CONTENT) VALUES ('" + comment.articleId + "', '" + comment.nickname + "', (SELECT CURRENT_DATE()), '" + comment.content + "');";
        const result = await conn.query(sql);
        res.status(200).send("Komentarz zapisany, powinien pojawić się wkrótce");
    }
    catch (err) {

        throw err;
    }
    finally {
        if (conn) conn.end();
    }
})






app.post('/sendEmail', async (req, res) => {

    console.log("email: " + req.body.params.email);
    console.log("content: " + req.body.params.content);
    res.send("Poprawnie odebrano email");
})

app.use(express.static('dist'));
app.listen(80);