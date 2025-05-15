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

// Button to explicitly trigger camera access (helps with iOS)
enableCameraBtn.addEventListener("click", function() {
  // Update status
  cameraStatus.textContent = "Requesting camera...";
  debugInfo.textContent = "Button clicked, requesting camera";
  
  // This is the critical part - directly request camera in the click handler
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // Very simple request - don't use async/await or promises at the top level
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true // Keep it simple - complex constraints may not trigger the permission popup
    })
    .then(function(stream) {
      // Success handler
      debugInfo.textContent = "Camera permission granted";
      video.srcObject = stream;
      video.setAttribute('autoplay', true);
      video.setAttribute('playsinline', true);
      video.muted = true;
      
      // Try to play the video
      video.play()
      .then(function() {
        // Video is playing
        debugInfo.textContent += "\nVideo playing";
        cameraStatus.textContent = "Camera working";
        enableCameraBtn.style.display = "none";
        detectionStatus.classList.remove("hidden");
        document.getElementById('camera-controls').classList.remove('hidden'); // Show camera controls
        setupFaceDetection();
      })
      .catch(function(err) {
        debugInfo.textContent += "\nPlay error: " + err;
      });
    })
    .catch(function(err) {
      // Handle errors
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

// Add flip camera functionality when video is playing
function flipCamera() {
  const videoTrack = video.srcObject?.getVideoTracks()[0];
  
  if (videoTrack) {
    // Get current camera settings
    const settings = videoTrack.getSettings();
    
    // Get current facingMode
    const currentFacingMode = settings.facingMode;
    debugInfo.textContent = "Current camera mode: " + (currentFacingMode || "unknown");
    
    // Set new facingMode (opposite of current)
    const newFacingMode = currentFacingMode === "user" ? "environment" : "user";
    
    // Stop current track
    videoTrack.stop();
    
    // Request camera with new facingMode
    navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: newFacingMode } 
    })
    .then(function(stream) {
      video.srcObject = stream;
      debugInfo.textContent = "Camera flipped to: " + newFacingMode;
      
      // Make sure face detection is running
      setupFaceDetection();
    })
    .catch(function(err) {
      debugInfo.textContent = "Error flipping camera: " + err.name;
    });
  } else {
    debugInfo.textContent = "No video track found to flip";
  }
}

// Fix the face detection function to correctly handle mirroring and orientation
async function detectFaces() {
  if (video.readyState !== 4 || !video.srcObject) return; // Not ready yet
  
  try {
    // Make sure canvas dimensions match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
    }
    
    // Run face detection
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
      scoreThreshold: 0.3 // Lower threshold to detect faces more easily
    }));
    
    // Clear previous drawings
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    if (detections && detections.length > 0) {
      // Face detected
      const face = detections[0].box;
      const faceCenterX = face.x + face.width / 2;
      const frameWidth = video.videoWidth;
      
      // Draw face indicator
      context.beginPath();
      context.arc(faceCenterX, face.y + face.height / 2, 10, 0, 2 * Math.PI);
      context.strokeStyle = "red";
      context.lineWidth = 4;
      context.stroke();
      
      // Draw face box
      context.beginPath();
      context.rect(face.x, face.y, face.width, face.height);
      context.strokeStyle = "green";
      context.lineWidth = 2;
      context.stroke();
      
      // Update tracking status
      faceLastSeen = Date.now();
      statusDot.classList.add("active");
      statusText.textContent = "Face detected";
      
      if (!trackingActive) {
        trackingActive = true;
        console.log("Face acquired.");
      }
      
      // Get the screen orientation to adjust directions if needed
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      
      // Determine direction based on face position
      // For mirrored selfie camera (user facing), we need to invert left/right
      let dir = "center";
      
      // Check if we're using front camera (mirrored)
      const videoTrack = video.srcObject?.getVideoTracks()[0];
      const facingMode = videoTrack?.getSettings()?.facingMode;
      const isFrontCamera = facingMode === "user" || facingMode === undefined; // Default to assuming front camera
      
      if (faceCenterX < frameWidth / 3) {
        dir = isFrontCamera ? "right" : "left"; // Invert for front camera
      } else if (faceCenterX > frameWidth * 2 / 3) {
        dir = isFrontCamera ? "left" : "right"; // Invert for front camera
      }
      
      // Update direction display
      directionValue.textContent = dir;
      
      // Send direction to ESP32
      fetch(`${ESP32_IP}/rotate?dir=${dir}`)
        .then(() => console.log("Direction sent:", dir))
        .catch(err => console.warn("ESP32 fetch error:", err));
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
