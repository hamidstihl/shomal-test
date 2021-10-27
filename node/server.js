const express = require('express');
const path = require('path');
const mongo = require('mongodb');
const ObjectId = mongo.ObjectId;
const sis = require('socket.io-stream');
//let https = require('https');
//let http = require('http');
//const util = require('util');
const fs = require('fs');

const config = {
    key_file: 'ssl/new.key',
    cert_file: 'ssl/new.crt',

    db_host: "localhost",
    db_user: "root",
    db_password: "",
    db_port: 27017,
    db_database: "shomal",

    wss_port: 8443,
    http_port: 80,

    io_pingTimeout: 30000,
    io_pingInterval: 5000,
    io_origin: "*",
    io_credentials: false,
}
const appConfig = {
    only_admin_can_add_member_to_group: true,
    n_message_per_page: 50,
    multiple_login_one_account: false
}

/*let options = {
    key: fs.readFileSync(config.key_file),
    cert: fs.readFileSync(config.cert_file)
};
*/

let MongoClient = mongo.MongoClient;
let url = "mongodb://" + config.db_host + ":" + config.db_port + "/";
let db;
let User, Chat, Group, Channel, GroupUser, ChannelUser, ChatMessage, GroupMessage, ChannelMessage, UserContact;
MongoClient.connect(url, function (err, dbo) {
    if (err) throw err;
    db = dbo.db(config.db_database);
    try {
        db.createCollection("users");
        db.createCollection("chats");
        db.createCollection("groups");
        db.createCollection("channels");
        db.createCollection("chat_messages");
        db.createCollection("group_messages");
        db.createCollection("channel_messages");
        db.createCollection("group_users");
        db.createCollection("channel_users");
        db.createCollection("user_session_sockets");
        db.createCollection("user_contacts");
        db.collection('user_session_sockets').deleteMany({});
    } catch (e) {

    }
    User = db.collection('users');
    Chat = db.collection('chats');
    Group = db.collection('groups');
    Channel = db.collection('channels');
    GroupUser = db.collection('group_users');
    ChannelUser = db.collection('channel_users');
    ChatMessage = db.collection('chat_messages');
    GroupMessage = db.collection('group_messages');
    ChannelMessage = db.collection('channel_messages');
    UserContact = db.collection('user_contacts');

    initUsers();
});


//const conn = util.promisify(connection.query).bind(connection);


const app = express();
app.use(express.static('../front/static'))
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '../front/login.html'));
});
app.get('/dashboard', function (req, res) {
    res.sendFile(path.join(__dirname, '../front/dashboard.html'));
});
app.listen(config.http_port, () => {
    console.log(`Example app listening at http://localhost:${config.http_port}`)
})

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

//let app2 = express();
//http.createServer(app2).listen(8000);

//let nodeStatic = require('node-static');
//let fileServer = new(nodeStatic.Server)();
/*let app = https.createServer(options, function (req, res) {
    //res.writeHead(200);
    //res.end("hello world\n");
    fileServer.serve(req, res);
}).listen(8443);
*/

const httpServer = require("http").createServer();

//const io = require("socket.io")(app, {
const io = require("socket.io")(httpServer, {
    pingTimeout: config.io_pingTimeout,
    pingInterval: config.io_pingInterval,
    cors: {
        origin: config.io_origin,
        credentials: config.io_credentials
    }
});
httpServer.listen(config.wss_port);
console.log("server stated on " + config.wss_port);

io.sockets.on('connection', function (socket) {
    let mobile = socket.handshake.query.label;
    let token = socket.handshake.query.token;
    //console.log("logged user in room => " + village +" token => " + token );
    requestConnect(mobile, token, socket);
    socket.on('disconnect', function () {
    });
    socket.on('disconnecting', function (){
        socket.rooms.forEach(function (room) {
            //console.log(room)
            let roomArray = room.split("_");
            //console.log(room)
            if (room[1])
                socket.broadcast.to(room).emit("user offline", {
                    type: roomArray[0],
                    id: roomArray[1],
                    user_id: socket.userId
                });
        });
        db.collection('user_session_sockets').deleteOne({socket_id: socket.id});
    });

    ///////////////////////

    sis(socket).on('file upload', function (stream, data) {
        let filename = path.basename("");
        filename += "../file_upload/" + now() + "_" + generateRandomName() + "." + data.ext;
        stream.pipe(fs.createWriteStream(filename));
    });
    sis(socket).on('file download', function (stream, name, callback) {
        let filename = path.basename("");
        filename += "../file_upload/" + name;
        try {
            let stats = fs.statSync(filename);
            let size = stats.size;
            callback({
                name: name,
                size: size
            }, false);
            let MyFileStream = fs.createReadStream(filename);
            MyFileStream.pipe(stream);
        } catch (e) {
            callback({}, true);
        }
    });

    sis(socket).on('public download', function (stream, name, data, callback) {
        if(!stream||!name)
            return callback({}, true);
        let filename = path.basename("");
        filename += "../file_upload/public/" + name;
        //console.log("download",filename)
        try {
            let stats = fs.statSync(filename);
            let size = stats.size;
            callback({
                name: name,
                size: size
            }, false);
            let MyFileStream = fs.createReadStream(filename);
            MyFileStream.pipe(stream);
        } catch (e) {
            //console.log("err",e)
            callback({}, true);
        }
    });
    sis(socket).on('private download', async function (stream, name, data, callback) {
        if(!stream||!data.conversation_id||!data.conversation_type||!data.message_id)
            return callback({}, true);
        let access=await checkPrivateMessageAccess(data,socket);
        if(!access)
            return callback({},true);
        let filename = path.basename("");
        filename += "../file_upload/private/" + access;
        //console.log("download",filename)
        try {
            let stats = fs.statSync(filename);
            let size = stats.size;
            callback({
                name: name,
                size: size
            }, false);
            let MyFileStream = fs.createReadStream(filename);
            MyFileStream.pipe(stream);
        } catch (e) {
            //console.log("err",e)
            callback({}, true);
        }
    });

    sis(socket).on('public upload', function (stream, data, callback) {
        let fileAddress = path.basename("");
        let filename = now() + "_" + generateRandomName() + "." + data.ext;
        fileAddress += "../file_upload/public/" + filename;
        try {
            stream.pipe(fs.createWriteStream(fileAddress));
            callback(filename, false);
        } catch (e) {
            return callback("", true);
        }
    });
    sis(socket).on('private upload', function (stream, data, callback) {
        let fileAddress = path.basename("");
        let filename = now() + "_" + generateRandomName() + "." + data.ext;
        fileAddress += "../file_upload/private/" + filename;
        try {
            stream.pipe(fs.createWriteStream(fileAddress));
            callback(filename, false);
        } catch (e) {
            return callback("", true);
        }
    });

    /////////////////////////////

    socket.on('wss request', function (event, data, token) {
        selectEvent(event, data, socket).then(result => {
            io.to(socket.id).emit('wss response', result, token)
        }).catch(err => {
            console.log("server error", err);
            let result = {status: 500, data: {}, message: "مشکل داخلی پیش آمده"};
            io.to(socket.id).emit('wss response', result, token)
        })
    })
});


///////////////////////////////////////////////

const nodePass = JSON.stringify({
    token: 'hamidstihl@1400'
});

const nodeUpdateOptions = {
    hostname: 'morabi.app',
    port: 443,
    path: '/api/nodeUpdate',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': nodePass.length
    }
}

function checkUpdate() {
    let req = https.request(nodeUpdateOptions, function (res) {
        //console.log(res);
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            let obj = JSON.parse(chunk);
            //console.log('Response: ' + obj.private_conference[0].start_time.slice(11, 13));
            //console.log('data');
            //console.log(data);
            private_conference.concat(obj.private_conference);

        });

    });


    req.on('error', error => {
        console.log(error)
    });


    req.write(nodePass);

    req.end();

}

function initUsers() {
    let users = [
        {
            'id': 1,
            'name': 'سید حمید',
            'avatar': 'https://lh3.googleusercontent.com/ogw/ADea4I5VcllPULR2lWcEUALzSd6zImyzOvKjLbBMJA7LXw=s32-c-mo',
            'bio': 'این شعار من است',
            'mobile': '09382130944',
            'username': 'hamid',
            'token': '222222',
        },
        {
            'id': 2,
            'name': 'امین',
            'avatar': '',
            'bio': 'من شعار ندارم',
            'mobile': '09382130945',
            'username': 'amin',
            'token': '333333',
        },
        {
            'id': 3,
            'name': 'محمدعلی',
            'avatar': 'https://cdn3.iconfinder.com/data/icons/business-avatar-1/512/3_avatar-512.png',
            'bio': '',
            'mobile': '09382130946',
            'username': 'mammad',
            'token': '444444',
        },
        {
            'id': 4,
            'name': 'استاد شاکری',
            'avatar': '',
            'bio': 'اصلا به تو چه',
            'mobile': '09382130947',
            'username': 'tehrani',
            'token': '555555',
        },
        {
            'id': 5,
            'name': 'تنهای خسته',
            'avatar': '',
            'bio': 'فقط برای تست مینویسم',
            'mobile': '09382130948',
            'username': 'alone',
            'token': '666666',
        },
    ];

    users.map(user => {
        db.collection("users").findOne({id: user.id}, function (err, dbUser) {
            if (err) {
                throw err;

            }
            if (dbUser) {
                db.collection("users").updateOne(
                    {id: user.id},
                    {
                        $set: {token: user.token}
                    }
                )
            } else {
                db.collection("users").insertOne(user, function (e, data) {
                    if (e)
                        throw e;

                    console.log("user " + user.name + " added")
                });

            }
        });

    })
    /*db.collection("users").insertMany(users,function (e,data){
        if(e)
            throw e;

        console.log("users set:",data)
    });
*/
}

///////////////////////////////////////////////////////////////

function requestConnect(mobile, token, socket) {
    db.collection("users").findOne({mobile: mobile}, function (err, user) {
        if (err) {
            console.log("server error2", err);
            io.to(socket.id).emit("initial error", 500);
            socket.disconnect(true);
            return;
        }
        if (user && user.token === token) {
            if (!appConfig.multiple_login_one_account) {
                db.collection('user_session_sockets').findOne({user_id: user.id}, function (err, session) {
                    if (err)
                        throw err;
                    if (session) {
                        io.to(session.socket_id).emit("duplicate login error");
                        io.in(session.socket_id).disconnectSockets();
                    }
                })
            }
            db.collection('user_session_sockets').insertOne({user_id: user.id, socket_id: socket.id});
            socket.userId = user.id;
            socket.userName = user.name;
            io.to(socket.id).emit("set user", user);
            getOldMessage(socket);
            //});
        } else {
            //console.log("initial error")
            io.to(socket.id).emit("initial error", 401);
            socket.disconnect(true);
        }
    });
}

async function getOldMessage(socket) {
    let chats = await Chat.find({$or: [{'user1.id': socket.userId}, {'user2.id': socket.userId}]}).toArray();
    let data = [];
    let otherUsersId = [];
    chats.map(chat => {
        if (chat.user1.id === socket.userId) {
            otherUsersId.push(chat.user2.id);
        } else {
            otherUsersId.push(chat.user1.id);
        }
        //join in chat to send notification for chat's member
        let room_name = "chat_" + chat._id;
        socket.join(room_name);
        // broadcast to everyone in the room
        socket.broadcast.to(room_name).emit("user online", {type: "chat", id: chat._id, user_id: socket.userId});
    });
    let otherUsers = await User.find({id: {$in: otherUsersId}}, {projection: {_id: 0, token: 0}}).toArray();
    chats.map(async chat => {
        let newData = {type: "chat", last_message: chat.last_message};
        let userLastMessage;
        let userMute;
        if (chat.user1.id === socket.userId) {
            userLastMessage = chat.user1.last_message;
            userMute = chat.user1.mute;
        } else {
            userLastMessage = chat.user2.last_message;
            userMute = chat.user2.mute;
        }
        for (let i = 0; i < otherUsers.length; i++) {
            //console.log(otherUsers[i].id,chat.user1.id,chat.user2.id);
            if (chat.user1.id === otherUsers[i].id || chat.user2.id === otherUsers[i].id) {
                newData.data = {
                    user_last_message: userLastMessage,
                    mute: userMute,
                    name: otherUsers[i].name,
                    other_user_id: otherUsers[i].id,
                    avatar: otherUsers[i].avatar,
                    id: chat._id
                };
                break;
            }
        }
        newData.n_new_message = await ChatMessage.find({chat_id: chat._id, time: {$gt: userLastMessage}}).count();
        data.push(newData)
    });
    //////////
    let groupUsers = await GroupUser.find({user_id: socket.userId}).toArray();
    let groupsId = [];
    groupUsers.map(group => {
        groupsId.push(group.group_id);
        //join in group to send notification for group's member
        let room_name = "group_" + group.group_id;
        socket.join(room_name);
        // broadcast to everyone in the room
        socket.broadcast.to(room_name).emit("user online", {type: "group", id: group.group_id, user_id: socket.userId});
    })
    let groups = await Group.find({_id: {$in: groupsId}}).toArray();
    await Promise.all(groups.map(async group => {
        let newData = {type: "group", last_message: group.last_message};
        let userLastMessage;
        for (let i = 0;
             i < groupUsers.length; i++) {
            if (group._id.equals(groupUsers[i].group_id)) {
                userLastMessage = groupUsers[i].last_message;
                newData.data = {
                    user_last_message: userLastMessage,
                    level: groupUsers[i].level,
                    mute: groupUsers[i].mute,
                    name: group.name,
                    avatar: group.avatar,
                    id: group._id
                };
                break;
            }
        }
        newData.n_new_message = await GroupMessage.find({group_id: group._id, time: {$gt: userLastMessage}}).count();

        data.push(newData)
    }));
    ////////////
    let channelUsers = await ChannelUser.find({user_id: socket.userId}).toArray();
    let channelsId = [];
    channelUsers.map(channel => {
        channelsId.push(channel.channel_id);
        //join in channel to send notification for channel's member
        let room_name = "channel_" + channel.channel_id;
        socket.join(room_name);
        // broadcast to everyone in the room
        socket.broadcast.to(room_name).emit("user online", {
            type: "channel", id: channel.channel_id, user_id: socket.userId});
    })
    let channels = await Channel.find({_id: {$in: channelsId}}).toArray();
    await Promise.all(channels.map(async channel => {
        let newData = {type: "channel", last_message: channel.last_message};
        let userLastMessage;
        for (let i = 0;
             i < channelUsers.length; i++) {
            if (channel._id.equals(channelUsers[i].channel_id)) {
                userLastMessage = channelUsers[i].last_message;
                newData.data = {
                    user_last_message: userLastMessage,
                    level: channelUsers[i].level,
                    mute: channelUsers[i].mute,
                    name: channel.name,
                    avatar: channel.avatar,
                    id: channel._id
                };
                //console.log("newData",newData)
                break;
            }
        }
        newData.n_new_message = await ChannelMessage.find({channel_id: channel._id, time: {$gt: userLastMessage}}).count();
        data.push(newData)
    }));
    //////////////////
    //sort
    data.sort(function (a, b) {
        if (a.last_message < b.last_message) return 1;
        if (a.last_message > b.last_message) return -1;
        return 0;
    });
    //////////////
    io.to(socket.id).emit("old message", data);
}

function now() {
    return +new Date();
}

function generateRandomName() {
    let result = [];
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < 20; i++) {
        result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
    }
    return result.join('');
}

async function checkPrivateMessageAccess(data, socket) {
    let conversation_id = new ObjectId(data.conversation_id);
    let message_id = new ObjectId(data.message_id);
    if(data.conversation_type==="chat")
    {
        let chat = await Chat.findOne({_id: conversation_id});
        if (!chat || (chat.user1.id !== socket.userId && chat.user2.id !== socket.userId))
            return false;
        let message=await ChatMessage.findOne({_id:message_id});
        if (!message || !conversation_id.equals(message.chat_id) || !message.content)
            return false;
        return message.content;
    }
    else if(data.conversation_type==="group")
    {
        let user = await GroupUser.findOne({group_id: conversation_id, user_id: socket.userId});
        //console.log("user",user)
        if (!user)
            return false;
        let message=await GroupMessage.findOne({_id:message_id});
        //console.log(conversation_id.equals(message.group_id))
        if (!message || !conversation_id.equals(message.group_id) || !message.content)
            return false;
        return message.content;
    }
    else if(data.conversation_type==="channel")
    {
        let user = await ChannelUser.findOne({channel_id: conversation_id, user_id: socket.userId});
        if (!user)
            return false;
        let message=await ChannelMessage.findOne({_id:message_id});
        if (!message || !conversation_id.equals(message.channel_id) || !message.content)
            return false;
        return message.content;
    }
    return false;
}

////////////////////////////////////////////////////////////

async function selectEvent(event, data, socket)
{
    switch (event) {
        case "send chat message": {
            return await send_chat_message(data, socket);
        }
        case "send group message": {
            return await send_group_message(data, socket);
        }
        case "send channel message": {
            return await send_channel_message(data, socket);
        }
        case "create group": {
            return await create_group(data, socket);
        }
        case "create channel": {
            return await create_channel(data, socket);
        }
        case "add member group": {
            return await add_members_group(data, socket);
        }
        case "remove member group": {
            return await remove_members_group(data, socket);
        }
        case "join channel": {
            return await join_channel(data, socket);
        }
        case "get chat message": {
            return await get_chat_message(data, socket);
        }
        case "get group message": {
            return await get_group_message(data, socket);
        }
        case "get channel message": {
            return await get_channel_message(data, socket);
        }
        case "chat select": {
            return await chat_select(data, socket);
        }
        case "group select": {
            return await group_select(data, socket);
        }
        case "channel select": {
            return await channel_select(data, socket);
        }
        case "seen message": {
            return await seen_message(data, socket);
        }
        case "mute notification": {
            return await mute_notification(data, socket);
        }
        case "add contact": {
            return await add_contact(data, socket);
        }
        case "get contact": {
            return await get_contact(data, socket);
        }
        case "send first chat message": {
            return await send_first_chat_message(data, socket);
        }
        case "upgrade to admin": {
            return await upgrade_to_admin(data, socket);
        }
        case "downgrade to admin": {
            return await downgrade_to_admin(data, socket);
        }
        case "left from group":  {
            return await left_from_group(data, socket);
        }
        case "left from channel":  {
            return await left_from_channel(data, socket);
        }
        default: {
            return {status: 404, data: [], message: "درخواست یافت نشد"}
        }
    }
}

async function send_first_chat_message(data, socket) {
    //validation user_id,type,content
    let chat = await Chat.findOne({$or:[{'user1.id': socket.userId,'user2.id':data.user_id},
            {'user2.id': socket.userId,'user1.id':data.user_id}]});
    let chatId;
    let time = now();
    if (!chat) {
        chat = await Chat.insertOne({
            user1: {id: socket.userId, last_message: time, block: false, mute: false},
            user2: {id: data.user_id, last_message: 0, block: false, mute: false}, last_message: time
        });
        chatId = chat.insertedId;
    }
    else {
        chatId = chat._id;
        if (chat.user1.id === socket.userId) {
            await Chat.updateOne({_id: chat_id}, {
                $set: {
                    'user1.last_message': time,
                    last_message: time
                }
            })
        } else {
            await Chat.updateOne({_id: chat_id}, {
                $set: {
                    'user2.last_message': time,
                    last_message: time
                }
            })
        }
    }
    let messageData = {type: data.type, content: data.content,name:data.name,size:data.size,description:data.description,
        chat_id: chatId, sender: socket.userId, time: time};
    let message = await ChatMessage.insertOne(messageData)
    // broadcast to everyone in the room
    let room_name = "chat_" + chat._id;
    socket.join(room_name);
    let sockets_id = await db.collection('user_session_sockets').find({user_id: data.user_id}).toArray();
    sockets_id.map(async userSocket => {
        const sockets = await io.in(userSocket.socket_id).fetchSockets();
        sockets[0].join(room_name)
        io.to(userSocket.socket_id).emit('new conversation',{type:"chat",id:chatId,name:socket.userName,last_message:time});
    })
    socket.broadcast.to("chat_" + data.id).emit("message send", {
        type: "chat",
        id: message.insertedId,
        message: messageData
    });
    return {
        status: 200,
        data: {chat_id:chatId,id: message.insertedId, time: time},
        message: "پیام با موفقیت ارسال شد"
    };
}

async function send_chat_message(data, socket) {
    let chat_id = new ObjectId(data.id);
    let chat = await Chat.findOne({_id: chat_id});
    if (!chat || (chat.user1.id !== socket.userId && chat.user2.id !== socket.userId)) {
        return {
            status: 400,
            data: {},
            message: 'گفتگو یافت نشد',
        }
    }
    let time = now();
    /*if (!chat ||) {
        //console.log("chat2",chat)
        chat = await Chat.insertOne({
            user1: {id: socket.userId, last_message: time, block: false, mute: false},
            user2: {id: data.id, last_message: 0, block: false, mute: false}, last_message: time
        });
        chatId = chat.insertedId;
    } else {*/
    // update chat
    //console.log("chat4",chat)
    if (chat.user1.id === socket.userId) {
        await Chat.updateOne({_id: chat_id}, {
            $set: {
                'user1.last_message': time,
                last_message: time
            }
        })
    } else {
        await Chat.updateOne({_id: chat_id}, {
            $set: {
                'user2.last_message': time,
                last_message: time
            }
        })
    }
    //chatId = chat._id;
    //}
    //console.log("chat5", chatId)
    let messageData = {type: data.type, content: data.content,name:data.name,size:data.size,description:data.description,
        chat_id: chat_id, sender: socket.userId, time: time};
    let message = await ChatMessage.insertOne(messageData)
    // broadcast to everyone in the room
    socket.broadcast.to("chat_" + data.id).emit("message send", {
        type: "chat",
        id: message.insertedId,
        message: messageData
    });
    return {
        status: 200,
        data: {id: message.insertedId, time: time},
        message: "پیام با موفقیت ارسال شد"
    };
}

async function send_group_message(data, socket) {
    //validation id,type,content
    let group_id = new ObjectId(data.id);
    let user = await GroupUser.findOne({group_id: group_id, user_id: socket.userId});
    if (!user) {
        return {
            status: 400,
            data: {},
            message: "گروه یافت نشد"
        };
    }
    let time = now();
    let messageData = {group_id: group_id, type: data.type, content: data.content,name:data.name,size:data.size,
        description:data.description, time: time, sender: socket.userId};
    let message = await GroupMessage.insertOne(messageData);
    await db.collection("groups").updateOne({_id: group_id}, {$set: {last_message: time}})
    await db.collection("group_users").updateOne({
        group_id: group_id,
        user_id: socket.userId
    }, {$set: {last_message: time}})
    // broadcast to everyone in the room
    socket.broadcast.to("group_" + data.id).emit("message send", {
        type: "group",
        id: message.insertedId,
        message: messageData
    });
    return {
        status: 200,
        data: {id: message.insertedId, time: time},
        message: "پیام با موفقیت ارسال شد",
    }
}

async function send_channel_message(data, socket) {
    //validation id,type,content
    let channel_id = new ObjectId(data.id);
    let user = await ChannelUser.findOne({channel_id: channel_id, user_id: socket.userId});
    if (!user || user.level !== "admin") {
        //console.log("user",user)
        return {
            status: 400,
            data: {},
            message: "کانال یافت نشد"
        };
    }
    let time = now();
    let messageData = {channel_id: channel_id, type: data.type, content: data.content,name:data.name,
        size:data.size,description:data.description, time: time, sender: socket.userId};
    let message = await ChannelMessage.insertOne(messageData);
    await db.collection("channels").updateOne({_id: channel_id}, {$set: {last_message: time}})
    await db.collection("channel_users").updateOne({
        channel_id: channel_id,
        user_id: socket.userId
    }, {$set: {last_message: time}})
    // broadcast to everyone in the room
    socket.broadcast.to("channel_" + data.id).emit("message send", {
        type: "channel",
        id: message.insertedId,
        message: messageData
    });
    return {
        status: 200,
        data: {id: message.insertedId, time: time},
        message: "پیام با موفقیت ارسال شد",
    }
}

async function create_group(data, socket) {
    //validation  name,avatar,users->distinct
    if (data.users.includes(socket.userId))
        return {
            status: 400,
            data: "لیست اعضا درست نیست",
            message: "داده های ورودی نامعتبر است"
        };
    let time = now();
    let group = await Group.insertOne({name: data.name, avatar: data.avatar, last_message: time});
    let groupId = group.insertedId;
    let groupUsers = [];
    let room_name = "group_" + groupId;
    data.users.map(user => {
        groupUsers.push({group_id: groupId, user_id: user, last_message: time - 1, level: "user", mute: false})
    })
    let sockets_id = await db.collection('user_session_sockets').find({user_id: {$in: data.users}}).toArray();
    sockets_id.map(async userSocket => {
        const sockets = await io.in(userSocket.socket_id).fetchSockets();
        sockets[0].join(room_name)
    })
    socket.join(room_name);
    groupUsers.push({group_id: groupId, user_id: socket.userId, last_message: time, level: "admin", mute: false})
    await GroupUser.insertMany(groupUsers);
    let content = socket.userName + " گروه " + data.name + " را ایجاد کرد.";
    await GroupMessage.insertOne({type: "info", content: content, sender: "system", group_id: groupId, time: time});
    return {
        status: 200,
        data: {id: groupId, time: time},
        message: "گروه با موفقیت ایجاد شد"
    };
}

async function create_channel(data, socket) {
    //validation  name,avatar
    let time = now();
    let channel = await Channel.insertOne({name: data.name, avatar: data.avatar, last_message: time});
    let channelId = channel.insertedId;
    await ChannelUser.insertOne({
        channel_id: channelId,
        user_id: socket.userId,
        last_message: time,
        level: "admin",
        mute: false
    });
    let room_name = "channel" + channelId;
    socket.join(room_name);
    let content = socket.userName + " کانال " + data.name + " را ایجاد کرد.";
    await ChannelMessage.insertOne({
        type: "info",
        content: content,
        sender: "system",
        channel_id: channelId,
        time: time
    });
    return {
        status: 200,
        data: {id: channelId, time: time},
        message: "کانال با موفقیت ایجاد شد"
    };
}

async function add_members_group(data, socket) {
    //validation  group_id, users->distinct
    let group_id = new ObjectId(data.group_id);
    let user = await GroupUser.findOne({group_id: group_id, user_id: socket.userId});
    if (!user || (appConfig.only_admin_can_add_member_to_group && user.level !== "admin")) {
        return {
            status: 400,
            data: {},
            message: "تنها مدیر گروه مجاز به افزودن کاربر میباشد"
        };
    }
    let exist = await GroupUser.findOne({group_id: group_id, user_id: {$in: data.users}});
    if (exist) {
        return {
            status: 400,
            data: exist,
            message: "لیست کاربران ورودی صحیح نیست"
        };
    }
    let time = now();
    let group_users = [];
    let usernames = await User.find({id: {$in: data.users}}, {
        projection: {
            name: 1,
            avatar: 1,
            id: 1,
            _id: 0
        }
    }).toArray();
    let group_messages = [];
    let room_name = "group_" + group_id;
    data.users.map(userId => {
        group_users.push({group_id: group_id, user_id: userId, level: "user", last_message: time - 1, mute: false});
    })
    let sockets_id = await db.collection('user_session_sockets').find({user_id: {$in: data.users}}).toArray();
    if (sockets_id.length) {
        sockets_id.map(async userSocket => {
            const sockets = await io.in(userSocket.socket_id).fetchSockets();

            sockets[0].join(room_name)
        })
    }
    await GroupUser.insertMany(group_users);
    usernames.map(username => {
        let content = username.name + " توسط " + socket.userName + " به گروه اضافه شد";
        group_messages.push({group_id: group_id, type: "info", content: content, time: time, sender: 0});
    })
    await GroupMessage.insertMany(group_messages);
    await db.collection("groups").updateOne({_id: group_id}, {$set: {last_message: time}})
    return {
        status: 200,
        data: usernames.map(username=>{return {...username,level:"user"}}),
        message: "کاربران با موفقیت افزوده شدند",
    }
}

async function remove_members_group(data, socket) {
    //validation  group_id, user_id
    let group_id = new ObjectId(data.group_id);
    let user = await GroupUser.findOne({group_id: group_id, user_id: socket.userId});
    if (!user || (appConfig.only_admin_can_add_member_to_group && user.level !== "admin")) {
        //console.log("user",user)
        return {
            status: 400,
            data: {},
            message: "تنها مدیر گروه مجاز به حذف کاربر میباشد"
        };
    }
    let exist = await GroupUser.findOne({group_id: group_id, user_id: data.user_id});
    if (!exist) {
        return {
            status: 400,
            data: '',
            message: "کاربر در گروه وجود ندارد"
        };
    }
    let time = now();
    let username = await User.findOne({id: data.user_id}, {projection: {name: 1, _id: 0}});
    let room_name = "group_" + group_id;
    let sockets_id = await db.collection('user_session_sockets').find({user_id: data.user_id}).toArray();
    //console.log("length",sockets_id.length)
    if (sockets_id.length) {
        sockets_id.map(async userSocket => {
            const sockets = await io.in(userSocket.socket_id).fetchSockets();
            //console.log("rooms",room_name,sockets[0].rooms)
            sockets[0].leave(room_name)
            //console.log("socket id",userSocket.socket_id)
            io.to(userSocket.socket_id).emit('kick out from group',{group_id:data.group_id});
        })
    }
    await GroupUser.deleteOne({group_id: group_id, user_id: data.user_id});
    let content = username.name + " توسط " + socket.userName + " از گروه اخراج شد";
    await GroupMessage.insertOne({group_id: group_id, type: "info", content: content, time: time, sender: 0});
    await Group.updateOne({_id: group_id}, {$set: {last_message: time}})
    return {
        status: 200,
        data: '',
        message: "کاربر حذف شد",
    }
}

async function left_from_group(data, socket) {
    //validation  group_id
    let group_id = new ObjectId(data.group_id);
    let user = await GroupUser.findOne({group_id: group_id, user_id: socket.userId});
    if (!user) {
        //console.log("user",user)
        return {
            status: 400,
            data: {},
            message: "گروه یافت نشد"
        };
    }
    let time = now();
    let room_name = "group_" + group_id;
    socket.leave(room_name);
    await GroupUser.deleteOne({group_id: group_id, user_id: socket.userId});
    let content = socket.userName + " از گروه رفت";
    await GroupMessage.insertOne({group_id: group_id, type: "info", content: content, time: time, sender: 0});
    await Group.updateOne({_id: group_id}, {$set: {last_message: time}})
    return {
        status: 200,
        data: '',
        message: "",
    }
}

async function left_from_channel(data, socket) {
    //validation  channel_id
    let channel_id = new ObjectId(data.channel_id);
    let user = await ChannelUser.findOne({channel_id: channel_id, user_id: socket.userId});
    if (!user) {
        //console.log("user",user)
        return {
            status: 400,
            data: {},
            message: "کانال یافت نشد"
        };
    }
    let room_name = "channel_" + channel_id;
    socket.leave(room_name);
    await ChannelUser.deleteOne({channel_id: channel_id, user_id: socket.userId});
    return {
        status: 200,
        data: '',
        message: "",
    }
}

async function join_channel(data, socket) {
    //validation channel_id
    let channel_id = new ObjectId(data.channel_id);
    let channel = await Channel.findOne({_id: channel_id});
    if (!channel) {
        return {
            status: 400,
            data: {},
            message: "کانال یافت نشد"
        };
    }
    let user = await ChannelUser.findOne({channel_id: channel_id, user_id: socket.userId});
    if (user) {
        return {
            status: 400,
            data: {},
            message: "شما فبلا در این کانال عضو شده اید"
        };
    }
    let time = now();
    await db.collection("channel_users").insertOne({
        channel_id: channel_id,
        user_id: socket.userId,
        last_message: time,
        level: "subscriber",
        mute: false
    });
    return {
        status: 200,
        data: {},
        message: "شما با موفقیت عضو شدید",
    }
}

async function get_chat_message(data, socket) {
    //validation page,id
    let chat_id = new ObjectId(data.id);
    let chat = await Chat.findOne({_id: chat_id});
    if (!chat || (chat.user1.id !== socket.userId && chat.user2.id !== socket.userId)) {
        return {
            status: 400,
            data: {},
            message: 'گفتگو یافت نشد',
        }
    }
    let messages = await ChatMessage.find({chat_id: chat_id}).sort({time: -1}).limit(appConfig.n_message_per_page)
            .skip((data.page - 1) * appConfig.n_message_per_page).toArray();
    return {
        status: 200,
        data: {page: data.page, messages: messages},
        message: '',
    }
}

async function get_group_message(data, socket) {
    //validation page,id
    let group_id = new ObjectId(data.id);
    let userGroup = await GroupUser.findOne({group_id: group_id, user_id: socket.userId});
    if (!userGroup) {
        return {
            status: 400,
            data: {},
            message: 'گروه یافت نشد',
        }
    }
    let messages = await GroupMessage.find({group_id: group_id}).sort({time: -1}).limit(appConfig.n_message_per_page)
            .skip((data.page - 1) * appConfig.n_message_per_page).toArray();
    //let messages=await GroupMessage.find({group_id:group_id}).sort({time: -1}).limit(0).skip(0).toArray();
    return {
        status: 200,
        data: {page: data.page, messages: messages},
        message: '',
    }
}

async function get_channel_message(data, socket) {
    //validation page,id
    let channel_id = new ObjectId(data.id);
    let userChannel = await ChannelUser.findOne({channel_id: channel_id, user_id: socket.userId});
    if (!userChannel) {
        return {
            status: 400,
            data: {},
            message: 'کانال یافت نشد',
        }
    }
    let messages = await ChannelMessage.find({channel_id: channel_id}).sort({time: -1}).limit(appConfig.n_message_per_page)
            .skip((data.page - 1) * appConfig.n_message_per_page).toArray();
    return {
        status: 200,
        data: {page: data.page, messages: messages},
        message: '',
    }
}

async function chat_select(data, socket) {
    //validation id
    let chat_id = new ObjectId(data.id);
    let chat = await Chat.findOne({_id: chat_id});
    if (!chat || (chat.user1.id !== socket.userId && chat.user2.id !== socket.userId)) {
        if(!data.id)
            return {
                status: 200,
                data: {messages: [], n_pages_message: 0},
                message: '',
            }
        return {
            status: 400,
            data: {},
            message: 'گفتگو یافت نشد',
        }
    }
    let user, otherUser, otherUserId, otherUserLastMessage;
    if (chat.user1.id === socket.userId) {
        user = chat.user1;
        otherUserId = chat.user2.id;
        otherUserLastMessage = chat.user2.last_message;
    } else {
        user = chat.user2;
        otherUserId = chat.user1.id;
        otherUserLastMessage = chat.user1.last_message;
    }
    otherUser = await User.findOne({id: otherUserId}, {projection: {token: 0, _id: 0}})
    let messages = await get_chat_message({id: data.id, page: 1}, socket);
    let n_message = await ChatMessage.find({chat_id: chat_id}).count();
    let result = {
        id: data.id,
        mute: user.mute,
        block: user.block,
        user_last_message: user.last_message,
        other_user_last_message: otherUserLastMessage,
        other_user: otherUser,
        messages: messages.data.messages,
        n_pages_message: Math.ceil(n_message / appConfig.n_message_per_page)
    };
    return {
        status: 200,
        data: result,
        message: '',
    }
}

async function group_select(data, socket) {
    //validation id
    //console.log(data);
    let group_id = new ObjectId(data.id);
    let groupUser = await GroupUser.findOne({'group_id': group_id, 'user_id': socket.userId});
    //console.log("guser",data,groupUser)
    if (!groupUser) {
        return {
            status: 400,
            data: {},
            message: 'گروه یافت نشد',
        }
    }
    let group = await Group.findOne({_id: group_id});
    let otherUsers, otherUsersId = [];
    otherUsers = await GroupUser.find({group_id: group_id}, {projection: {_id: 0, group_id: 0, mute: 0}}).toArray();
    otherUsers.map(user => {
        otherUsersId.push(user.user_id);
    })
    let otherUsersDetails = await User.find({id: {$in: otherUsersId}}, {projection: {_id: 0, token: 0}}).toArray();
    for (let i = 0; i < otherUsers.length; i++) {
        for (let j = 0; j < otherUsersDetails.length; j++) {
            if (otherUsers[i].user_id === otherUsersDetails[j].id) {
                otherUsers[i] = {...otherUsers[i], ...otherUsersDetails[j]}
                break;
            }
        }
    }
    let messages = await get_group_message({id: data.id, page: 1}, socket);
    let n_message = await GroupMessage.find({group_id: group_id}).count();
    let result = {
        id: data.id,
        mute: groupUser.mute,
        level: groupUser.level,
        user_last_message: groupUser.last_message,
        other_users: otherUsers,
        name: group.name,
        avatar: group.avatar,
        messages: messages.data.messages,
        n_pages_message: Math.ceil(n_message / appConfig.n_message_per_page)
    };
    return {
        status: 200,
        data: result,
        message: '',
    }
}

async function channel_select(data, socket) {
    //validation id
    let channel_id = new ObjectId(data.id);
    let channelUser = await ChannelUser.findOne({'channel_id': channel_id, 'user_id': socket.userId});
    if (!channelUser) {
        return {
            status: 400,
            data: {},
            message: 'کانال یافت نشد',
        }
    }
    let channel = await Channel.findOne({_id: channel_id});
    let admin_users, admin_users_id = [];
    admin_users = await ChannelUser.find({channel_id: channel_id, level: "admin"}, {
        projection: {
            _id: 0,
            channel_id: 0,
            mute: 0,
            level: 0
        }
    }).toArray();
    admin_users.map(user => {admin_users_id.push(user.user_id)})
    let adminUsersDetails = await User.find({id: {$in: admin_users_id}}, {projection: {_id: 0, token: 0}}).toArray();
    for (let i = 0; i < admin_users.length; i++) {
        for (let j = 0; j < adminUsersDetails.length; j++) {
            if (admin_users[i].user_id === adminUsersDetails[j].id) {
                admin_users[i] = {...admin_users[i], ...adminUsersDetails[j]}
                break;
            }
        }
    }
    let messages = await get_channel_message({id: data.id, page: 1}, socket);
    let n_message = await ChannelMessage.find({channel_id: channel_id}).count();
    let result = {
        id: data.id,
        mute: channelUser.mute,
        level: channelUser.level,
        user_last_message: channelUser.last_message,
        admin_users: admin_users,
        name: channel.name,
        avatar: channel.avatar,
        messages: messages.data.messages,
        n_pages_message: Math.ceil(n_message / appConfig.n_message_per_page)
    };
    return {
        status: 200,
        data: result,
        message: '',
    }
}

async function seen_message(data, socket) {
    //validation message_type, time, id
    let id = new ObjectId(data.id);
    let time = Math.min(now(), data.time);
    if (data.type === "chat") {
        let update = await Chat.updateOne({_id: id, 'user1.id': socket.userId}, {$max: {'user1.last_message': time}})
        if (!update.matchedCount)
            await Chat.updateOne({_id: id, 'user2.id': socket.userId}, {$max: {'user2.last_message': time}})
    } else if (data.type === "group") {
        await GroupUser.updateOne({group_id: id, user_id: socket.userId}, {$max: {last_message: time}})
    } else if (data.type === "channel") {
        await ChannelUser.updateOne({channel_id: id, user_id: socket.userId}, {$max: {last_message: time}})
    }
    return {
        status: 200,
        data: {},
        message: '',
    }
}

async function mute_notification(data, socket) {
    //validation message_type, mute, id
    let id = new ObjectId(data.id);
    if (data.type === "chat") {
        let update = await Chat.updateOne({_id: id, 'user1.id': socket.userId}, {$set: {'user1.mute': !!data.mute}})
        if (!update.matchedCount)
            await Chat.updateOne({_id: id, 'user2.id': socket.userId}, {$set: {'user2.mute': !!data.mute}})
    } else if (data.type === "group") {
        await GroupUser.updateOne({group_id: id, user_id: socket.userId}, {$set: {mute: !!data.mute}})
    } else if (data.type === "channel") {
        await ChannelUser.updateOne({channel_id: id, user_id: socket.userId}, {$set: {mute: !!data.mute}})
    }
    return {
        status: 200,
        data: {},
        message: '',
    }
}

async function add_contact(data, socket) {
    //validation mobile, name
    let user = await User.findOne({mobile: data.mobile});
    if (!user || user.id === socket.userId) {
        return {
            status: 400,
            data: {},
            message: "کاربر یافت نشد",
        }
    }
    let contact = await UserContact.findOne({creator_id: socket.userId, contact_id: user.id});
    if (contact) {
        return {
            status: 400,
            data: {},
            message: "مخاطب قبلا افزوده شده است",
        }
    }
    let inputs = {creator_id: socket.userId, contact_id: user.id, name: data.name};
    UserContact.insertOne(inputs);
    return {
        status: 200,
        data: {...inputs, avatar: user.avatar},
        message: '',
    }
}

async function get_contact(data, socket) {
    //validation mobile, name
    let contacts = await UserContact.find({creator_id: socket.userId}).toArray();
    let contacts_id = [];
    contacts.map(contact => {
        contacts_id.push(contact.contact_id);
    })
    let users = await User.find({id: {$in: contacts_id}}, {projection: {id: 1, avatar: 1, _id: 0}}).toArray();
    for (let i = 0; i < contacts.length; i++) {
        for (let j = 0; j < users.length; j++) {
            if (contacts[i].contact_id === users[j].id) {
                contacts[i].avatar = users[j].avatar;
                break;
            }
        }
    }
    return {
        status: 200,
        data: contacts,
        message: '',
    }
}

async function upgrade_to_admin(data, socket) {
    //validation type id user_id
    let id = new ObjectId(data.id);
    if (data.type === "group") {
        let user = await GroupUser.findOne({group_id: id, user_id: socket.userId});
        if (!user || user.level !== "admin") {
            return {
                status: 400,
                data: {},
                message: "تنها مدیر گروه مجاز به ارتقا کاربر میباشد"
            };
        }
        await GroupUser.updateOne({group_id: id, user_id: data.user_id}, {$set:{level: "admin"}})
    } else if (data.type === "channel") {
        let user = await ChannelUser.findOne({channel_id: id, user_id: socket.userId});
        if (!user || user.level !== "admin") {
            return {
                status: 400,
                data: {},
                message: "تنها مدیر کانال مجاز به ارتقا کاربر میباشد"
            };
        }
        await ChannelUser.updateOne({channel_id: id, user_id: data.user_id}, {$set:{level: "admin"}})
    }
    let sockets_id = await db.collection('user_session_sockets').find({user_id: data.user_id}).toArray();
    sockets_id.map(async userSocket => {
        io.to(userSocket.socket_id).emit('upgrade to admin',{type:data.type,id:data.id});
    })
    return {
        status: 200,
        data: {},
        message: '',
    }
}

async function downgrade_to_admin(data, socket) {
    //validation type id user_id
    let id = new ObjectId(data.id);
    let level;
    if (data.type === "group") {
        let user = await GroupUser.findOne({group_id: id, user_id: socket.userId});
        if (!user || user.level !== "admin") {
            return {
                status: 400,
                data: {},
                message: "تنها مدیر گروه مجاز به ارتقا کاربر میباشد"
            };
        }
        level="user";
        await GroupUser.updateOne({group_id: id, user_id: data.user_id}, {$set:{level: level}})
    } else if (data.type === "channel") {
        let user = await ChannelUser.findOne({channel_id: id, user_id: socket.userId});
        if (!user || user.level !== "admin") {
            return {
                status: 400,
                data: {},
                message: "تنها مدیر کانال مجاز به ارتقا کاربر میباشد"
            };
        }
        level="subscriber";
        await ChannelUser.updateOne({channel_id: id, user_id: data.user_id}, {$set:{level: level}})
    }
    let sockets_id = await db.collection('user_session_sockets').find({user_id: data.user_id}).toArray();
    sockets_id.map(async userSocket => {
        io.to(userSocket.socket_id).emit('downgrade to user',{type:data.type,id:data.id,level:level});
    })
    return {
        status: 200,
        data: {level:level},
        message: '',
    }
}











