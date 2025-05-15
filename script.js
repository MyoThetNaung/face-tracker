document.addEventListener('DOMContentLoaded', function() {
  // Check if this is iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  if (isIOS) {
    // Add iOS-specific instructions
    cameraStatus.textContent = "Tap 'Enable Camera' button (iOS detected)";
    enableCameraBtn.style.fontSize = '18px';
    enableCameraBtn.style.padding = '15px 20px';
  } else {
    cameraStatus.textContent = "Click 'Enable Camera' to start";
  }
  
  // Check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraStatus.textContent = "Your browser doesn't support camera access or you're not using HTTPS";
    enableCameraBtn.disabled = true;
    enableCameraBtn.style.backgroundColor = '#888';
    console.error("getUserMedia not supported");
  }
});

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const context = canvas.getContext("2d");
const enableCameraBtn = document.getElementById("enable-camera");
const cameraStatus = document.getElementById("camera-status");
const detectionStatus = document.getElementById("detection-status");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const directionValue = document.getElementById("direction-value");
const debugInfo = document.getElementById("debug-info");
const debugButton = document.getElementById("debug-button");

const ESP32_IP = "http://192.168.x.x"; // Replace with your ESP32 IP

let faceLastSeen = Date.now();
let trackingActive = false;
let faceDetectionInterval = null;

// Load face detection models
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'),
  faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'),
  faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/')
]).then(() => {
  console.log("Face detection models loaded");
  cameraStatus.textContent = "Models loaded. Click button to enable camera.";
}).catch(error => {
  console.error("Error loading face detection models:", error);
  cameraStatus.textContent = "Error loading face detection models. Please refresh.";
});

// Always use the front camera for all getUserMedia calls
function requestFrontCamera() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user" }
  });
}

// Update all camera access points to use requestFrontCamera()
enableCameraBtn.addEventListener("click", function() {
  cameraStatus.textContent = "Requesting camera...";
  debugInfo.textContent = "Button clicked, requesting camera";
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    requestFrontCamera()
      .then(function(stream) {
        debugInfo.textContent = "Camera permission granted";
        video.srcObject = stream;
        video.setAttribute('autoplay', true);
        video.setAttribute('playsinline', true);
        video.muted = true;
        video.play()
          .then(function() {
            debugInfo.textContent += "\nVideo playing";
            cameraStatus.textContent = "Camera working";
            enableCameraBtn.style.display = "none";
            detectionStatus.classList.remove("hidden");
            document.getElementById('camera-controls').classList.remove('hidden');
            setupFaceDetection();
          })
          .catch(function(err) {
            debugInfo.textContent += "\nPlay error: " + err;
          });
      })
      .catch(function(err) {
        debugInfo.textContent = "Camera error: " + err.name;
        cameraStatus.textContent = "Camera error: " + err.name;
        if (err.name === "NotAllowedError") {
          cameraStatus.textContent = "Camera access denied!";
        }
      });
  } else {
    cameraStatus.textContent = "Camera API not available";
    debugInfo.textContent = "getUserMedia API not available";
  }
});

function startVideo() {
  // Moved functionality to button click handler
  cameraStatus.textContent = "Click 'Enable Camera' button to start";
}

function setupFaceDetection() {
  // Make sure canvas matches video dimensions
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 240;
  
  // Clear any existing interval
  if (faceDetectionInterval) {
    clearInterval(faceDetectionInterval);
  }
  
  // Update debug info
  debugInfo.textContent = "Setting up face detection. Video dimensions: " + 
                          video.videoWidth + "x" + video.videoHeight;
  
  // Start face detection loop
  faceDetectionInterval = setInterval(detectFaces, 300);
}

// Direct camera access through DOM
video.addEventListener('loadedmetadata', function() {
  debugInfo.textContent += "\nVideo metadata loaded";
  
  if (video.srcObject) {
    setupFaceDetection();
  }
});

// Make sure detection starts if the video is already playing
video.addEventListener('playing', function() {
  debugInfo.textContent += "\nVideo is playing";
  
  if (!faceDetectionInterval && video.srcObject) {
    setupFaceDetection();
  }
});

// In detectFaces, flip the X coordinate for direction logic
async function detectFaces() {
  if (video.readyState !== 4 || !video.srcObject) return;
  try {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
    }
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
      scoreThreshold: 0.3
    }));
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (detections && detections.length > 0) {
      const face = detections[0].box;
      const faceCenterX = face.x + face.width / 2;
      const frameWidth = video.videoWidth;
      // Flip X for mirrored display
      const mirroredFaceCenterX = frameWidth - faceCenterX;
      // Draw green rectangle (square) around the face
      context.save();
      context.strokeStyle = "#00FF00";
      context.lineWidth = 3;
      context.beginPath();
      context.rect(face.x, face.y, face.width, face.height);
      context.stroke();
      context.restore();
      // Draw direction label below the face box, centered
      let dir = "center";
      if (mirroredFaceCenterX < frameWidth / 3) dir = "left";
      else if (mirroredFaceCenterX > frameWidth * 2 / 3) dir = "right";
      context.save();
      context.font = "bold 20px Arial";
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillStyle = "#00FF00";
      context.strokeStyle = "#111";
      context.lineWidth = 4;
      // Draw background for text for better visibility
      const labelX = face.x + face.width / 2;
      const labelY = face.y + face.height + 8;
      const text = dir.toUpperCase();
      // Draw background rectangle for text
      const metrics = context.measureText(text);
      const padding = 6;
      context.fillStyle = "rgba(0,0,0,0.7)";
      context.fillRect(labelX - metrics.width / 2 - padding, labelY - padding / 2, metrics.width + padding * 2, 28);
      // Draw the text
      context.fillStyle = "#00FF00";
      context.fillText(text, labelX, labelY);
      context.restore();
      // Draw face indicator (red dot)
      context.save();
      context.beginPath();
      context.arc(faceCenterX, face.y + face.height / 2, 10, 0, 2 * Math.PI);
      context.strokeStyle = "red";
      context.lineWidth = 4;
      context.stroke();
      context.restore();
      faceLastSeen = Date.now();
      statusDot.classList.add("active");
      statusText.textContent = "Face detected";
      if (!trackingActive) {
        trackingActive = true;
        console.log("Face acquired.");
      }
      directionValue.textContent = dir;
      fetch(`${ESP32_IP}/rotate?dir=${dir}`)
        .then(() => console.log("Direction sent:", dir))
        .catch(err => console.warn("ESP32 fetch error:", err));
    } else {
      statusDot.classList.remove("active");
      statusText.textContent = "No face detected";
      if (Date.now() - faceLastSeen > 2000 && trackingActive) {
        trackingActive = false;
        console.log("Face lost. Waiting...");
        directionValue.textContent = "center";
        fetch(`${ESP32_IP}/rotate?dir=center`).catch(err => console.warn("ESP32 fetch error:", err));
      }
    }
  } catch (error) {
    console.error("Face detection error:", error);
    debugInfo.textContent = "Face detection error: " + error.message;
  }
}

debugButton.addEventListener("click", () => {
  try {
    // Get camera state information
    const videoState = {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      paused: video.paused,
      currentTime: video.currentTime,
      readyState: video.readyState,
      networkState: video.networkState,
      srcObject: video.srcObject ? "Stream present" : "No stream",
      browser: navigator.userAgent
    };
    
    // Update debug info
    debugInfo.textContent = JSON.stringify(videoState, null, 2);
    
    // Try to force camera access again
    if (!video.srcObject) {
      debugInfo.textContent += "\nNo video stream - trying to access camera again";
      
      navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" } 
      }).then(stream => {
        video.srcObject = stream;
        video.play().catch(e => debugInfo.textContent += "\nPlay error: " + e);
        debugInfo.textContent += "\nCamera access retry successful";
      }).catch(err => {
        debugInfo.textContent += "\nCamera retry error: " + err.name;
      });
    }
  } catch (err) {
    debugInfo.textContent = "Debug error: " + err.message;
  }
});
