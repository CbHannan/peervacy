import { Component, OnInit, AfterContentInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from "@angular/router";
import * as io from 'socket.io-client';
import { Observable } from 'rxjs';
import * as adapter from 'webrtc-adapter';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterContentInit, OnDestroy {
 
  public hideVideo: boolean = false;
  public hideVoice: boolean = false;
  public hideText: boolean = false;
  public mediaReceived: boolean = false;
  public mediaData: any;
  public menuClosed;
  public message;
  public messages = [];
  public socket;
  public isInitiator = false;
  room: any;

  @ViewChild('vid1')
  vid1: ElementRef;
  @ViewChild('vid2')
  vid2: ElementRef;
  @ViewChild('media')
  photo: ElementRef;
  @ViewChild('preview')
  preview: ElementRef;
  @ViewChild('trail')
  trail: ElementRef;

  @ViewChild('snap')
  snap: ElementRef;
  @ViewChild('send')
  send: ElementRef;
 
 
 

  @ViewChild('downloadLink')
  downloadLink: ElementRef;
  @ViewChild('callButton')
  callButton: ElementRef;
  @ViewChild('hangupButton')
  hangupButton: ElementRef;

  @ViewChild('goToRoom')
  goToRoom: ElementRef;
  @ViewChild('shareURL')
  shareURL: ElementRef;
  @ViewChild('preloader1')
  preloader1: ElementRef;
  @ViewChild('preloader2')
  preloader2: ElementRef;

  constructor(private route: ActivatedRoute, private router: Router) {
    this.socket = io.connect(this.router.url);
    if (this.route.snapshot.params.id) {
      this.room = this.route.snapshot.params.id;
    }
  }

  ngOnInit() {
    
  }

  ngAfterContentInit() {

  

    let canvas = this.preview.nativeElement;
    
    var localLoaded: boolean = false;
    var remoteLoaded: boolean = false;

    var mediaReceived = this.mediaReceived;
    var IMs = {};
    var isChannelReady = false;
    var isInitiator = false;
    var isStarted = false;
    var localStream;
    var pc;
    var room;
    var remoteStream;
    var turnReady;
    var dataChannel;
    var trail = document.getElementById("trail");
    var viewer = document.getElementById('viewer');
    var photo = this.photo.nativeElement;
    var preview = this.preview.nativeElement;
    var photoContext: CanvasRenderingContext2D = canvas.getContext('2d');
    var snapBtn = this.snap.nativeElement;
    var sendBtn = this.send.nativeElement;
    var photoContextW;
    var photoContextH;

    //Attach event handlers
    snapBtn.addEventListener('click', snapPhoto);
    sendBtn.addEventListener('click', sendPhoto);


    // Disable send buttons by default.
    sendBtn.disabled = true;

    var pcConfig = {
      'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302',
        'credential': null
      }]
    };


    // Set up audio and video regardless of what devices are present.
    var sdpConstraints = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    };

    /////////////////////////////////////////////
    if (this.room) {
       room = this.room;
    } else {
      room = prompt('Enter room name:');
      this.room = room;
    }
    // Could prompt for room name:
    // room = prompt('Enter room name:');

    var socket = io.connect();

    if (room !== '') {
      socket.emit('create or join', room);
      console.log('Attempted to create or  join room', room);
    }

    socket.on('created', ((room) => {
      console.log('Created room ' + room);
      isInitiator = true;
      this.isInitiator = true;
    }));

    socket.on('full', function (room) {
      console.log('Room ' + room + ' is full');
    });

    socket.on('join', function (room) {
      console.log('Another peer made a request to join room ' + room);
      console.log('This peer is the initiator of room ' + room + '!');
      isChannelReady = true;
    });

    socket.on('joined', function (room) {
      console.log('joined: ' + room);
      isChannelReady = true;
      this.isInitiator = false;

    });

    socket.on('log', function (array) {
      console.log.apply(console, array);
    });

    ////////////////////////////////////////////////

    function sendMessage(message) {
      console.log('Client sending message: ', message);
      socket.emit('message', message);
    }
  

    // This client receives a message
    socket.on('message', function (message) {
      console.log('Client received message:', message);
      if (message === 'got user media') {
        maybeStart();
      } else if (message.type === 'offer') {
        if (!isInitiator && !isStarted) {
          maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
      } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
      } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
          sdpMLineIndex: message.label,
          candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
      } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
      }
    });

    socket.on('IM', ((message) => {
      console.log('IM received, msg: ' + message.msg + ', isInitiator: ' + message.host);
        this.messages.push(message);
    }))

    ////////////////////////////////////////////////////

    var localVideo = this.vid2.nativeElement;
    var remoteVideo = this.vid1.nativeElement;
    var remoteLoader = this.preloader1.nativeElement;
    var localLoader = this.preloader2.nativeElement;

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: 1280, height: 720 }
    })
      .then(gotStream)
      .catch(function (e) {
        alert('getUserMedia() error: ' + e.name);
      });

    function gotStream(stream) {
      console.log('Adding local stream.');
      localLoader.classList.remove('d-none');
      localStream = stream;
      localVideo.srcObject = stream;
      localVideo.onloadedmetadata = function () {
        preview.width = photoContextW = localVideo.videoWidth ;
        preview.height = photoContextH = localVideo.videoHeight;
        console.log('gotStream with width and height:', photoContextW, photoContextH);
      };
      localVideo.oncanplay = function () {
        localLoader.classList.add('fade-out');
        localVideo.classList.remove('bg-dark');
      }
      sendMessage('got user media');
      if (isInitiator) {
        maybeStart();
      } 
    }

    var constraints = {
      audio: false,
      video: { width: 1280, height: 720 }
    };


    console.log('Getting user media with constraints', constraints);

    if (location.hostname !== 'obscure-scrubland-24735.herokuapp.com') {
      requestTurn(
        'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
      );
    }

    function maybeStart() {
      console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
      if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
        console.log('>>>>>> creating peer connection');
        createPeerConnection();
        pc.addStream(localStream);
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
          doCall();
        } else {
          pc.ondatachannel = function (event) {
            console.log('ondatachannel:', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
          };
        }
      }
    }

    window.onbeforeunload = function () {
      sendMessage('bye');
    };

    /////////////////////////////////////////////////////////

    function createPeerConnection() {
      try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
      } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
      }
    }

    function handleIceCandidate(event) {
      console.log('icecandidate event: ', event);
      if (event.candidate) {
        sendMessage({
          type: 'candidate',
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        });
      } else {
        console.log('End of candidates.');
      }
    }

    function handleCreateOfferError(event) {
      console.log('createOffer() error: ', event);
    }

    function doCall() {
      console.log('Creating Data Channel');
      dataChannel = pc.createDataChannel('photos');
      onDataChannelCreated(dataChannel);

     
      console.log('Sending offer to peer');
      pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
    }

    function doAnswer() {
      console.log('Sending answer to peer.');

      pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
      );
    }

    function setLocalAndSendMessage(sessionDescription) {
      pc.setLocalDescription(sessionDescription);
      console.log('setLocalAndSendMessage sending message', sessionDescription);
      sendMessage(sessionDescription);
    }

    function onCreateSessionDescriptionError(error) {
      trace('Failed to create session description: ' + error.toString());
    }

    function requestTurn(turnURL) {
      var turnExists = false;
      for (var i in pcConfig.iceServers) {
        if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
          turnExists = true;
          turnReady = true;
          break;
        }
      }
      if (!turnExists) {
        console.log('Getting TURN server from ', turnURL);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4 && xhr.status === 200) {
            var turnServer = JSON.parse(xhr.responseText);
            console.log('Got TURN server: ', turnServer);
            pcConfig.iceServers.push({
              'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
              'credential': turnServer.password
            });
            turnReady = true;
          }
        };
        xhr.open('GET', turnURL, true);
        xhr.send();
      }
    }

    function handleRemoteStreamAdded(event) {
      console.log('Remote stream added.');
      remoteLoader.classList.remove('d-none');
      remoteStream = event.stream;
      remoteVideo.srcObject = remoteStream;
      remoteVideo.oncanplay = function () {
        remoteLoader.classList.add('fade-out');
        remoteVideo.classList.remove('bg-dark');
      }
    }

    function handleRemoteStreamRemoved(event) {
      console.log('Remote stream removed. Event: ', event);
    }

    function hangup() {
      console.log('Hanging up.');
      stop();
      sendMessage('bye');
    }

    function handleRemoteHangup() {
      console.log('Session terminated.');
      stop();
      isInitiator = false;
    }

    function stop() {
      isStarted = false;
      pc.close();
      pc = null;
    }

    function trace(text) {
      text = text.trim();
      const now = (window.performance.now() / 1000).toFixed(3);

      console.log(now, text);
    }
    function onDataChannelCreated(channel) {
      console.log('onDataChannelCreated:', channel);

      channel.onopen = function () {
        console.log('CHANNEL opened!!!');
        sendBtn.disabled = false;
      };

      channel.onclose = function () {
        console.log('Channel closed.');
        sendBtn.disabled = true;
      }

      channel.onmessage = (adapter.browserDetails.browser === 'firefox') ?
        receiveDataFirefoxFactory() : receiveDataChromeFactory();
    }

    function receiveDataChromeFactory() {
      var buf, count;

      return function onmessage(event) {
        if (typeof event.data === 'string') {
          buf = window['buf'] = new Uint8ClampedArray(parseInt(event.data));
          count = 0;
          console.log('Expecting a total of ' + buf.byteLength + ' bytes');
          return;
        }

        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);

        count += data.byteLength;
        console.log('count: ' + count);

        if (count === buf.byteLength) {
          // we're done: all data chunks have been received
          console.log('Done. Rendering photo.');
          renderPhoto(buf);
        }
      };
    }

    function receiveDataFirefoxFactory() {
      var count, total, parts;
      mediaReceived = true;

      return function onmessage(event) {
        if (typeof event.data === 'string') {
          total = parseInt(event.data);
          parts = [];
          count = 0;
          console.log('Expecting a total of ' + total + ' bytes');
          return;
        }

        parts.push(event.data);
        count += event.data.size;
        console.log('Got ' + event.data.size + ' byte(s), ' + (total - count) +
          ' to go.');

        if (count === total) {
          console.log('Assembling payload');
          var buf = new Uint8ClampedArray(total);
          var compose = function (i, pos) {
            var reader = new FileReader();
            reader.onload = (event) => {
              buf.set(new Uint8ClampedArray(+event), pos);
              if (i + 1 === parts.length) {
                console.log('Done. Rendering photo.');
                renderPhoto(buf);
              } else {
                compose(i + 1, pos + this.result.byteLength);
              }
            };
            reader.readAsArrayBuffer(parts[i]);
          };
          compose(0, 0);
        }
      };
    }


    /****************************************************************************
    * Aux functions, mostly UI-related
    ****************************************************************************/

   
    function snapPhoto() {
      photoContext.drawImage(localVideo, 0, 0, preview.width, preview.height);
      //show(photo, sendBtn);
    }

    function sendPhoto() {
      // Split data channel message in chunks of this byte length.
      var CHUNK_LEN = 64000;
      console.log('width and height ', photoContextW, photoContextH);
      var img = photoContext.getImageData(0, 0, photoContextW, photoContextH),
        len = img.data.byteLength,
        n = len / CHUNK_LEN | 0;

      console.log('Sending a total of ' + len + ' byte(s)');

      if (!dataChannel) {
        logError('Connection has not been initiated. ' +
          'Get two peers in the same room first');
        return;
      } else if (dataChannel.readyState === 'closed') {
        logError('Connection was lost. Peer closed the connection.');
        return;
      }

      dataChannel.send(len);

      // split the photo and send in chunks of about 64KB
      for (var i = 0; i < n; i++) {
        var start = i * CHUNK_LEN,
          end = (i + 1) * CHUNK_LEN;
        console.log(start + ' - ' + (end - 1));
        dataChannel.send(img.data.subarray(start, end));
      }

      // send the reminder, if any
      if (len % CHUNK_LEN) {
        console.log('last ' + len % CHUNK_LEN + ' byte(s)');
        dataChannel.send(img.data.subarray(n * CHUNK_LEN));
      }
    }

  
    function renderPhoto(data) {
      //this.mediaData = data;
      viewer.classList.add('d-block');
      var canvas = document.createElement('canvas');
      canvas.width = 1280; //document.width is obsolete
      canvas.height = 720; //document.height is obsolete
      viewer.style.width = 'document.body.clientWidth'; //document.width is obsolete
      viewer.style.height = 'document.body.clientHeight'; //document.height is obsolete
      canvas.classList.add('embed-responsive-item');
      canvas.style['objectFit'] = 'contain';
      // trail is the element holding the incoming images
      trail.insertBefore(canvas, trail.firstChild);

      var context = canvas.getContext('2d');
      var img = context.createImageData(photoContextW, photoContextH);
      img.data.set(data);
      context.putImageData(img, 0, 0);
    }

    function closeMedia() {
      trail['data'] = [];
      viewer.classList.remove('d-block');
    }

    function show() {
      Array.prototype.forEach.call(arguments, function (elem) {
        elem.style.display = null;
      });
    }

    function hide() {
      Array.prototype.forEach.call(arguments, function (elem) {
        elem.style.display = 'none';
      });
    }

    function randomToken() {
      return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
    }

    function logError(err) {
      if (!err) return;
      if (typeof err === 'string') {
        console.warn(err);
      } else {
        console.warn(err.toString(), err);
      }
    }

  }

  ngOnDestroy() {
    var socket = io.connect();
        socket.emit('bye');
    
  }
  sendChatMessage() {
    console.log('Client sending message: ', this.message);
    var chat = { host: this.isInitiator, msg: this.message }
    this.socket.emit('IM', chat);
    this.message = '';
}
  closeMedia() {
    var trail = document.getElementById("trail");
    var viewer = document.getElementById('viewer');
  trail['data'] = [];
  viewer.classList.remove('d-block');
}
  toggleVideo() {
    if (this.hideVideo) {
      this.hideVideo = false;
    } else {
      this.hideVideo = true;
    }
  }
  toggleVoice() {
    if (this.hideVoice) {
      this.hideVoice = false;
    } else {
      this.hideVoice = true;
    }
  }
  toggleText() {
    if (this.hideText) {
      this.hideText = false;
    } else {
      this.hideText = true;
    }
  }
  close() {
    this.menuClosed = true;
  }
   toRoom() {
  this.router.navigate([prompt('Enter room name:')]);
}

  //public downloadZip() {
  //  var trail = document.getElementById("trail");
  //  var context = trail.firstChild;
  //  const blob = context['data'];
  //  const url = window.URL.createObjectURL(blob);

  //  const link = this.downloadLink.nativeElement;
  //  link.href = url;
  //  link.click();

  //  window.URL.revokeObjectURL(url);

  //}
  }
  



