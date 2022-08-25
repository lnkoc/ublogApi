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

app.get('/login', (req, res) => {
    let data = req.query;
    if (req.signedCookies["shortSession"] === undefined) {

    //todo dopisać sprawdzenie z bazy danych
        if (data.login === "lnkoc") {
            if (data.first == 1) {
                if (data.last == 5) {
                    console.log("poprawne dane z pierwszego etapu");
                    let options = {
                        maxAge: 1000 * 15, // 15 sekund na przesłanie poprawnych danych
                        httpOnly: true,
                        signed: true
                    }
                    res.cookie('shortSession', "one", options);
                    res.status(200).end();
                }
                else {
                    res.end("Niepoprawny login lub hasło");
                }
            }
            else {
                res.end("Niepoprawny login lub hasło");
            }
        }
        else {
            res.end("Niepoprawny login lub hasło");
        }
    }
    else {
        if (req.signedCookies["shortSession"] == "one") {
            res.status(400).send("Serwer chwilowo niedostępny.");
        }
        
    }
});

app.get('/getCookie', (req, res) => {
   if (req.signedCookies["shortSession"] == "one") {

    //todo dopisać sprawdzenie z BD
        let data = req.query;
        if (data.pass === "12345") {
            console.log("poprawne logowanie drugiego etapu");
            let options = {
            maxAge: 1000 * 60 * 60,
            httpOnly: true,
            signed: true
            }
            res.cookie('longSession', "two", options);
            res.status(200).send();
        }
    }

});

app.post('/saveArticle', async (req, res) => {
    if(req.signedCookies["longSession"] == "two") {
        // console.log("correct cookie");
        console.log(req.body.params);
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "INSERT INTO ARTICLES (TITLE, INTRO, CONTENT) VALUES ('" + req.body.params.title + "', '" + req.body.params.intro + "', '" + req.body.params.content + "');";
            const res = await conn.query(sql);
            console.log(res);
        }
        catch (err) {
            console.log(err);
            throw err;
        }
        finally {
            if (conn) return conn.end();
        }
        res.send("dane przesłane popprawnie");
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
        if (conn) return conn.end();
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
        if (conn) return conn.end();
    }
})

app.post('/getArticle', async (req, res) => {
    if(req.signedCookies["longSession"] == "two") {
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
            if (conn) return conn.end();
        }
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }   
})

app.post('/updateArticle', async (req, res) => {
    if(req.signedCookies["longSession"] == "two") {
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
            if (conn) return conn.end();
        }
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }    
})

app.post('/deleteArticle', async (req, res) => {
    if(req.signedCookies["longSession"] == "two") {
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
            if (conn) return conn.end();
        }
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }
})

app.use(express.static('dist'));
app.listen(3000, '127.0.0.1');