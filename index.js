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

function getToken() {
    let time = new Date();
    return "token" + time.getFullYear() * (time.getDate() + 1) * (time.getMilliseconds() + 1);
}

async function credentialsCheck(req) {
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
            console.log(err);
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

async function sessionUpdate(req, res) {
    let cookie = req.signedCookies["session"];
    let success;
    if (cookie) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT (NOW() - (SELECT DATE FROM USER_SESSION)) AS AGE, TOKEN FROM USER_SESSION  WHERE TOKEN='" + cookie + "';";
            const result = await conn.query(sql);
            if (result.length === 1) {
                if (result[0].AGE < 3000) {
                    let token = getToken(); // ostrożnie z korzystaniem - ponieważ powstaje efekt wyścigów
                    let sql2 = "UPDATE USER_SESSION SET DATE = (SELECT NOW()), TOKEN='" + token + "' WHERE TOKEN='" + cookie + "';";
                    let result2 = await conn.query(sql2);
                    let options = {
                        maxAge: 1000 * 60 * 30,
                        httpOnly: true,
                        signed: true
                    }
                    res.cookie('session', token, options);
                    success = true;
                }
                else {
                    success = false;
                    console.log("1_if");    
                }
            }
            else {
                  success = false;
                console.log("2_if");
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
         console.log("3_if");
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
            console.log(err);
            throw(err);
        }
        finally {
            if (conn) conn.end();
        }
    }
    else {
        if (req.signedCookies["shortSession"] == "one two three") {
            res.status(400).end("Serwer chwilowo niedostępny.");
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
                
                //TODO szyfrowanie pass

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
    //TODO sprawdzić poprawność ciacha
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
    res.end("wylogowano");
})

app.post('/saveArticle', async (req, res) => {
    let article = req.body.params;
    if( await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "INSERT INTO ARTICLES (TITLE, INTRO, CONTENT, CREATED) VALUES ('" + article.title + "', '" + article.intro + "', '" + article.content + "', (SELECT CURRENT_DATE()));";
            const result = await conn.query(sql);
        }
        catch (err) {
            console.log(err);
            throw err;
        }
        finally {
            if (conn) conn.end();
        }
        res.status(201).send("dane przesłane popprawnie");
        //TODO Przetestować rozwiązanie
        //await sessionUpdate(req, res);
    }
    else {
        res.status(401).send("Brak autoryzacji lub sesja wygasła.");
    }
})

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

app.get('/getArticlesList', async (req, res) => {
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT ID, TITLE, CREATED, INTRO FROM ARTICLES ORDER BY ID DESC;";
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
        //TODO przetestować rozwiązanie
        //await sessionUpdate(req, res);
    } else {
        res.status(401).send("Brak autoryzacji");
    }
})

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

app.post('/getArticle', async (req, res) => {    
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT TITLE, INTRO, CONTENT, CREATED FROM ARTICLES WHERE ID = '" + req.body.params.id +"';";
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
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }   
})

app.post('/updateArticle', async (req, res) => {
    if(await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "UPDATE ARTICLES SET TITLE = '" + req.body.params.title + "', INTRO = '" + req.body.params.intro + "', CONTENT = '" + req.body.params.content + "' WHERE ID = '" + req.body.params.id + "';";
            const result = await conn.query(sql);
            res.send("update copleted");
        }
        catch (err) {
            console.log(err);
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

app.post('/deleteArticle', async (req, res) => {
    if(await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "DELETE FROM ARTICLES WHERE ID = '" + req.body.params.id + "';";
            const result = await conn.query(sql);
            res.send("delete completed");
        }
        catch (err) {
            console.log(err);
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

app.post('/saveComment', async (req, res) => {
    let comment = req.body.params;
    let conn;
    try {
        conn = await pool.getConnection();
        let sql = "INSERT INTO COMMENTS (ARTICLE_ID, NICKNAME, CREATED, CONTENT) VALUES ('" + comment.articleId + "', '" + comment.nickname + "', (SELECT CURRENT_DATE()), '" + comment.content + "');";
        const result = await conn.query(sql);
        res.send("Komentarz zapisany, powinien pojawić się wkrótce");
    }
    catch (err) {
        console.log(err);
        throw err;
    }
    finally {
        if (conn) conn.end();
    }
})
//TODO 
app.post('/getComments', async (req, res) => {
    let articleId = req.body.params.articleId;
    let conn;
    try {
        conn = await pool.getConnection();
        let sql = "SELECT CREATED, NICKNAME, CONTENT, ID FROM COMMENTS WHERE APPROVED='1' AND TRASH='0' AND ARTICLE_ID='" + articleId + "' ORDER BY ID;";
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

app.post('/getUndoneComments', async (req, res) => {
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT ARTICLES.TITLE, ARTICLES.INTRO, COMMENTS.ID, COMMENTS.NICKNAME, COMMENTS.CREATED, COMMENTS.CONTENT FROM ARTICLES, COMMENTS WHERE COMMENTS.ARTICLE_ID=ARTICLES.ID AND COMMENTS.APPROVED='0' AND COMMENTS.TRASH='0' ORDER BY TITLE, ID;";
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
    }
    else {
        res.send("undone comments Brak autoryzacji");
    }
})

app.get('/confirmComment', async (req, res) => {
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "UPDATE COMMENTS SET APPROVED='1' WHERE ID='" + req.query.commentId + "';";
            const result = conn.query(sql);
            res.send("Zatwierdzono komentarz o id " + req.query.commentId);
        }
        catch (err) {
            console.log(err);
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

app.get('/denyComment', async (req, res) => {
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "UPDATE COMMENTS SET TRASH='1' WHERE ID='" + req.query.commentId + "';";
            const result = conn.query(sql);
            res.send("Przeniesiono do kosza komentarz o id " + req.query.commentId);
        }
        catch (err) {
            console.log(err);
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

app.post('/getBinComments', async (req, res) => {
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "SELECT ARTICLES.TITLE, ARTICLES.INTRO, COMMENTS.ID, COMMENTS.NICKNAME, COMMENTS.CREATED, COMMENTS.CONTENT FROM ARTICLES, COMMENTS WHERE COMMENTS.TRASH='1' AND COMMENTS.ARTICLE_ID=ARTICLES.ID;";
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
    }
    else {
        console.log("get bin comments nie diała");
        res.send("get bin comments Brak autoryzacji");
    }
})

app.get('/restoreComment', async (req, res) => {
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "UPDATE COMMENTS SET TRASH='0' WHERE ID='" + req.query.commentId + "';";
            // console.log(sql);
            const result = await conn.query(sql);
            res.status(201).send("przywrócono...");
        }
        catch (err) {
            console.log(err);
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

app.get('/deleteComment', async (req, res) => {
    if (await credentialsCheck(req)) {
        let conn;
        try {
            conn = await pool.getConnection();
            let sql = "DELETE FROM COMMENTS WHERE ID='" + req.query.commentId + "';";
            const result = conn.query(sql);
            res.send("Usunięto komentarz o id: " + req.query.commentId);
        }
        catch (err) {
            console.log(err);
            throw err;
        }
        finally {
            if (conn) conn.end;
        }
    }
    else {
        res.status(401).send("Brak autoryzacji");
    }
})

app.post('/sendEmail', async (req, res) => {

    console.log("email: " + req.body.params.email);
    console.log("content: " + req.body.params.content);
    res.send("Poprawnie odebrano email");
})

app.use(express.static('dist'));
app.listen(3000, '127.0.0.1');