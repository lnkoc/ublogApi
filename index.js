const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mariadb = require('mariadb');
const app = express();

app.use(cookieParser("TajemniczyCiągZnaków"));
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());

const pool = mariadb.createPool({
    host: 'localhost',
    user: 'lnkoc',
    password: 'lnkoc',
    database: 'blogdb',
    connectionLimit: 5
});

function getToken() {
    let time = new Date();
    return "token" + time.getFullYear() * (time.getDate() + 1) * (time.getMilliseconds() + 1);
}

async function sessionUpdate(req, res) {
    let cookie = req.signedCookies["session"];
    let success;
    if (cookie) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT (NOW() - (SELECT DATE FROM USER_SESSION)) AS AGE, TOKEN FROM USER_SESSION  WHERE TOKEN='" + cookie + "';";
            result = await conn.query(sql);
            if (result.length === 1) {
                if (result[0].AGE < 3000) {
                    let token = getToken();
                    let sql2 = "UPDATE USER_SESSION SET DATE = (SELECT NOW()), TOKEN='" + token + "' WHERE TOKEN='" + cookie + "';";
                    result2 = await conn.query(sql2);
                    let options = {
                        maxAge: 1000 * 60 * 30,
                        httpOnly: true,
                        signed: true
                    }
                    res.cookie('session', token, options);
                    success = true;
                }
                else {
                    // res.end("Sesja wygasła");
                    success = false;    
                }
            }
            else {
                // console.log("zmdyfikowano ciacho");
                success = false;
            }
        }
        catch (err) {
            console.log(err);
            success = false;
        }
        finally {
            if (conn) conn.end();
        }
    }
    else {
        // res.status(401).send("Brak autoryzacji");
        success = false;
    }
    return success;
};

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
                        maxAge: 1000 * 15, // 15 sekund na przesłanie poprawnych danych
                        httpOnly: true,
                        signed: true
                    }
                    res.cookie('shortSession', "one two three", options);
                    res.status(200).end(); 
                }
                else {
                    res.end("Niepoprawny login lub hasło.");
                }          
            }
            else {
                res.end("Niepoprawny login lub hasło");
            }
        }
        catch (err) {
            console.log("Blad" + err);
            throw(err);
        }
        finally {
            if (conn) conn.end();
        }
    }
    else {
        if (req.signedCookies["shortSession"] == "one two three") {
            res.status(400).send("Serwer chwilowo niedostępny.");
            res.end();
        }
    }
});

app.get('/getCookie', async (req, res) => {
    if (req.signedCookies["shortSession"] == "one two three") {
        let data = req.query;
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT USER, PASSWORD FROM USER_SESSION WHERE USER='" + data.login + "';";
            const result = await conn.query(sql);
            if (result.length == 1) {
                let pass = result[0].PASSWORD;
                
                //todo szyfrowanie pass

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
                    res.status(200).send();
                    console.log("nadany token " + token);
                    
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
            console.log(err);
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

app.get('/logout', async (req, res) => {
    let cookie = req.signedCookies['session'];
    if (cookie) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "UPDATE USER_SESSION SET DATE=NULL, TOKEN=NULL WHERE TOKEN='" + cookie + "';";
            const response = await conn.query(sql);
        }
        catch (err) {
            console.log(err);
            throw(err);
        }
        finally {
            if (conn) conn.end();
        }
    }
    res.send("wylogowano poprawnie");
})

app.post('/saveArticle', async (req, res) => {
    let article = req.body.params;
    if( await sessionUpdate(req, res)) {
        console.log("ciacho updated");
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "INSERT INTO ARTICLES (TITLE, INTRO, CONTENT, CREATED) VALUES ('" + article.title + "', '" + article.intro + "', '" + article.content + "', (SELECT CURRENT_DATE()));";
            const result = await conn.query(sql);
            console.log("try works");
        }
        catch (err) {
            console.log(err);
            throw err;
        }
        finally {
            if (conn) conn.end();
        }
        res.status(201).send("dane przesłane popprawnie");
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }
})

app.get('/getList', async (req, res) => {
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

app.get('/getEntireArticle', async (req, res) => {
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

app.post('/getArticle', async (req, res) => {    
    if(await sessionUpdate(req, res)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT TITLE, INTRO, CONTENT FROM ARTICLES WHERE ID = '" + req.body.params.id +"';";
            const result = await conn.query(sql);
            res.send(result);
        }
        catch (err) {
            console.log(err);
        }
        finally {
            if (conn) conn.end();
        }
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }   
})

app.post('/updateArticle', async (req, res) => {
    if(await sessionUpdate(req, res)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "UPDATE ARTICLES SET TITLE = '" + req.body.params.title + "', INTRO = '" + req.body.params.intro + "', CONTENT = '" + req.body.params.content + "' WHERE ID = '" + req.body.params.id + "';";
            console.log(sql);
            const result = await conn.query(sql);
            console.log(result);
            res.send("update copleted");
        }
        catch (err) {
            console.log(err);
        }
        finally {
            if (conn) conn.end();
        }
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }    
})

app.post('/deleteArticle', async (req, res) => {
    if(await sessionUpdate(req, res)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "DELETE FROM ARTICLES WHERE ID = '" + req.body.params.id + "';";
            console.log(sql);
            const result = await conn.query(sql);
            console.log(result);
            res.send("delete completed");
        }
        catch (err) {
            console.log(err);
        }
        finally {
            if (conn) conn.end();
        }
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }
})

app.use(express.static('dist'));
app.listen(3000, '127.0.0.1');