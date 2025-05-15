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
  faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/')
]).then(() => {
  console.log("Face detection models loaded");
  cameraStatus.textContent = "Models loaded. Click button to enable camera.";
}).catch(error => {
  console.error("Error loading face detection models:", error);
  cameraStatus.textContent = "Error loading face detection models. Please refresh.";
});

// Button to explicitly trigger camera access (helps with iOS)
enableCameraBtn.addEventListener("click", async () => {
  try {
    // This needs to be directly connected to the user interaction for iOS
    cameraStatus.textContent = "Requesting camera access...";
    
    // Force iOS to show the permission prompt by directly calling getUserMedia from the click handler
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: {
        facingMode: "user",
        width: { ideal: 320 },
        height: { ideal: 240 }
      } 
    });
    
    // Set the stream directly
    video.srcObject = stream;
    
    // iOS requires these attributes
    video.setAttribute('autoplay', true);
    video.setAttribute('muted', true);
    video.setAttribute('playsinline', true);
    
    // Force play to happen after user interaction
    await video.play();
    
    // Update UI
    cameraStatus.textContent = "Camera access granted";
    enableCameraBtn.style.display = "none";
    detectionStatus.classList.remove("hidden");
    
    // Setup detection after successful camera access
    setupFaceDetection();
    
  } catch (err) {
    console.error("Camera access error:", err.name, err.message);
    
    if (err.name === "NotAllowedError") {
      cameraStatus.textContent = "Camera access denied. Please enable camera access in your browser settings and try again.";
    } else if (err.name === "NotFoundError") {
      cameraStatus.textContent = "No camera found. Please connect a camera and try again.";
    } else if (err.name === "NotReadableError") {
      cameraStatus.textContent = "Camera is in use by another application. Please close other camera apps.";
    } else {
      cameraStatus.textContent = "Camera error: " + err.message;
    }
  }
});

function startVideo() {
  // Moved functionality to button click handler
  cameraStatus.textContent = "Click 'Enable Camera' button to start";
}

function setupFaceDetection() {
  // Make sure canvas matches video dimensions
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Clear any existing interval
  if (faceDetectionInterval) {
    clearInterval(faceDetectionInterval);
  }
  
  // Start face detection loop
  faceDetectionInterval = setInterval(detectFaces, 300);
}

async function detectFaces() {
  if (video.readyState !== 4) return; // Not ready yet
  
  try {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length > 0) {
      const face = detections[0].box;
      const faceCenterX = face.x + face.width / 2;
      const frameWidth = video.videoWidth;

      // Draw face indicator
      context.beginPath();
      context.arc(faceCenterX, face.y + face.height / 2, 10, 0, 2 * Math.PI);
      context.strokeStyle = "red";
      context.lineWidth = 4;
      context.stroke();

      // Update tracking status
      faceLastSeen = Date.now();
      statusDot.classList.add("active");
      statusText.textContent = "Face detected";

      if (!trackingActive) {
        trackingActive = true;
        console.log("Face acquired.");
      }

      // Determine direction based on face position
      let dir = "center";
      if (faceCenterX < frameWidth / 3) dir = "left";
      else if (faceCenterX > frameWidth * 2 / 3) dir = "right";
      
      // Update direction display
      directionValue.textContent = dir;

      // Send direction to ESP32
      fetch(`${ESP32_IP}/rotate?dir=${dir}`).catch(err => console.warn("ESP32 fetch error:", err));
    } else {
      // No face detected
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
