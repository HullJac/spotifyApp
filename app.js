var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var axios = require('axios');     // Better not deprecated request type library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var config = require('./config.json');  // Helps to shorten the urls types for setlist.fm

// Get keys from file
var fs = require('fs');
var keys = [];
var array = fs.readFileSync('cred').toString().split("\n");
for(i in array) {
    keys.push(array[i]);
}

// For use with setlist possibly
const setlistfm_headers = {
    'Content-Type': 'application/json',
    'x-api-key': keys[2]
};

// Set key variables and redirect uri for spotify
var client_id = keys[0]; // Your client id
var client_secret = keys[1]; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
    .use(cors())
    .use(cookieParser());

// Spotify login route //
app.get('/login', function(req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = 'user-read-private user-read-email playlist-modify-private playlist-modify-public';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});


// Main callback route //
app.get('/callback', function(req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } 
    else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
            },
            json: true
        };

        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {

                var access_token = body.access_token,
                refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function(error, response, body) {
                    //console.log(response);
                    console.log("connected to spotify web api.");
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } 
            else {
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});


// Refresh token route //
app.get('/refresh_token', function(req, res) {

    // requesting access token from refresh token
    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
        }
    });
});


//////////////////////////////////////////////////////////////
// Creates a playlist using spotify api based on name passed//
//////////////////////////////////////////////////////////////
app.get('/createPlaylist', function(req, res) {
    var access_token = req.query.access_token;
    var playlist_name = req.query.playlist_name
    var user_id = req.query.user_id;
    let jsonData = {name: playlist_name};
    const url = 'https://api.spotify.com/v1/users/'+user_id+'/playlists'    
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + access_token
    }

    axios({
        method: 'POST',
        url: url,
        data: jsonData,
        dataType: 'json',
        headers: headers
    }).then((resp) => {
        console.log("SUCCESS creting playlist in app.js");
        res.sendStatus(200);
    }, (err) => {
        console.log("FAILURE creating playlist in app.js");
        console.log(err);
        res.sendStatus(500);
    });
});


////////////////////////////////////////////////
// Get setlist info by artist and other params//
////////////////////////////////////////////////
app.get('/setlistByArtist', function(req, res) {
    // Add more fields here, and account for artists with more than one name
    // But first, figure out how to grab the actual setlist data
    let artist = req.query.artist;
    let state = req.query.state;
    let city = req.query.city;
    let year = req.query.year;
    let playlist = req.query.playlist;

    // Create the url to query setlist.fm
    var url = config.baseUrl + config.setlists + artist + config.stateCode + state + config.page;
    //Check if stuff == "" and if it is just dont add it to the url
    if (year != ''){
       url = url + config.year + year; 
    }
    if (city != ''){
        url = url + config.city + city;
    }

    // Send request to setlist.fm
    axios({
        method: 'GET',
        url: url,
        headers: setlistfm_headers
    }).then((resp)=>{
        console.log("SUCCESS getting info from setlist.fm");
        //TODO Sort this data by ones that have songs in the setlists
        var goodSets = [];
        for (let i = 0; i < resp.data.setlist.length; i++) {
            if (resp.data.setlist[i].sets.set.length > 0) {
                goodSets.push({
                    '_id' : resp.data.setlist[i].id,
                    '_date' : resp.data.setlist[i].eventDate,
                    '_venue' : resp.data.setlist[i].venue.name,
                    '_city' : resp.data.setlist[i].venue.city.name,
                    '_set' : resp.data.setlist[i].sets.set[0]
                });
            }
        }
        //console.log(resp.data.setlist[2].sets.set[0].song);
        res.send({'setlists': goodSets});
    }, (err) => {
        console.log("FAILURE getting info from setlist.fm");
        res.sendStatus(500);
    });
});


console.log('Listening on 8888');
app.listen(8888);
