const mobile = "09382130944";

const token = "222222";

//const mobile = "09382130948";

//const token = "666666";



const toastr_option={
    "closeButton": true,
    "progressBar": true,
    "newestOnTop": true,
}

//var socket = io.connect("https://45.159.114.46:8080");

var socket = io.connect("http://localhost:8443?token="+token+"&label="+mobile, {withCredentials: false});


socket.on('message send', function(message) {
    console.log('message send:', message);

    /*chatMessage(message,true);

    if(message.senderName!==window.user.name && callState!=="ring") {
        internalStopCall();

        notificationAudio.src = messageNotification;

        notificationAudio.loop = false;

        notificationAudio.play();

    }*/
});


socket.on('old message', function(message) {
    console.log('old message:', message);

});


socket.on('disconnect', function () {
    console.log('disconnect client event....reconnect');

    toastr.error('ارتباط شما با سرور قطع شد.',"",toastr_option);

});


socket.on('connect', function (){
    console.log("connected");

})

socket.io.on("reconnect", (attempt) => {
    console.log("reconnect",attempt);

});


socket.on("initial error", (attempt) => {
    console.log("initial error",attempt);

});


socket.on("duplicate login error", () => {
    console.log("duplicate login error");

});


socket.on("user online", (data) => {
    console.log("user online",data);

});


socket.on("user offline", (data) => {
    console.log("user offline",data);

});


socket.on('wss response', (response,token) => {
    console.log("wss response",response,token);

});




$('#btnTest').click(function (){
    console.log("request send");

        ///socket.emit('wss request',"send chat message",{userId:5,type:"text",content:"متن پیام 2"},"token1");

        ///socket.emit('wss request',"send group message",{group_id:"616a4b2524f885c8ede2142c",type:"text",content:"متن پیام 2"},"token1");

        ///socket.emit('wss request',"send channel message",{channel_id:"616bc16e5091a372d37cb857",type:"link",content:"متن پیام 3"},"token1");

        ///socket.emit('wss request',"create group",{users:[3,2],name:"گروه 1",avatar:""},"token2");

        ///socket.emit('wss request',"create channel",{name:"گروه 1",avatar:""},"token2");

        ///socket.emit('wss request',"add member group",{users:[3,2],group_id:"616a4b2524f885c8ede2142c"},"token2");

    //socket.emit('wss request',"join channel",{channel_id:"616bc16e5091a372d37cb857"},"token2");

        ///socket.emit('wss request',"get chat message",{chat_id:"616be3482229ee53da8075b0",page:1},"token2");

        ///socket.emit('wss request',"get group message",{chat_id:"616be3482229ee53da8075b0",page:1},"token2");

        ///socket.emit('wss request',"get channel message",{chat_id:"616be3482229ee53da8075b0",page:1},"token2");

        ///socket.emit('wss request',"chat select",{id:"616be3482229ee53da8075b0"},"token2");

        ///socket.emit('wss request',"group select",{id:"616a4b2524f885c8ede2142c"},"token2");

        ///socket.emit('wss request',"channel select",{id:"616bc16e5091a372d37cb857"},"token2");

        ///socket.emit('wss request',"seen message",{type:"chat",id:"616be3482229ee53da8075b0",time:999999999999999},"token2");

        ///socket.emit('wss request',"mute notification",{type:"chat",id:"616be3482229ee53da8075b0",mute:true},"token2");


        ///uploadFile($('#imageInput')[0].files[0],"file upload");

        ///downloadFile("1634399362206_G4A18ArOACY5ALEFQgjQ.png");

});


function uploadFile(file,action) {
    let stream = ss.createStream();

    ss(socket).emit(action, stream, {size: file.size, ext: file.name.split('.').pop()});

    let blobStream = ss.createBlobReadStream(file);

    let size = 0;

    blobStream.on('data', function(chunk) {
        size += chunk.length;

        console.log(Math.floor(size / file.size * 100) + '%');

    });

    blobStream.pipe(stream);

}

function downloadFile(name) {
    let deferred = $.Deferred();

    let stream = ss.createStream(),
        fileBuffer = [],
        fileLength = 0;

    ss(socket).emit('file download', stream, name, function (fileInfo, fileError) {
        console.log("start",fileInfo,fileError);

        if (fileError) {
            deferred.reject(fileError);

        } else {
            console.log(['File Found!', fileInfo]);

            stream.on('data', function (chunk) {
                fileLength += chunk.length;

                let progress = Math.floor((fileLength / fileInfo.size) * 100);

                progress = Math.max(progress - 2, 1);

                console.log(progress+"%");

                deferred.notify(progress);

                fileBuffer.push(chunk);

            });

            stream.on('end', function () {
                let fileData = new Uint8Array(fileLength),
                    i = 0;

                fileBuffer.forEach(function (buff) {
                    for (let j = 0;
 j < buff.length;
 j++) {
                        fileData[i] = buff[j];

                        i++;

                    }
                });

                deferred.notify(100);

                downloadFileFromBlob([fileData], name);


                deferred.resolve();

            });

        }
    });

    return deferred;

}

let downloadFileFromBlob = (function () {
    let a = document.createElement("a");

    document.body.appendChild(a);

    a.style = "display: none";

    return function (data, fileName) {
        let blob = new Blob(data, {
                type : "octet/stream"
            }),
            url = window.URL.createObjectURL(blob);

        a.href = url;

        a.download = fileName;

        a.click();

        window.URL.revokeObjectURL(url);

    };

}());
