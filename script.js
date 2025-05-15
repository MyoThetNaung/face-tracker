const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const context = canvas.getContext("2d");
const enableCameraBtn = document.getElementById("enable-camera");
const cameraStatus = document.getElementById("camera-status");
const detectionStatus = document.getElementById("detection-status");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const directionValue = document.getElementById("direction-value");

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
enableCameraBtn.addEventListener("click", () => {
  startVideo();
});

function startVideo() {
  // Update UI
  cameraStatus.textContent = "Requesting camera access...";
  
  // iOS-specific settings
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // Additional constraints to help with mobile devices
  const constraints = {
    audio: false,
    video: {
      width: { ideal: 320 },
      height: { ideal: 240 },
      facingMode: "user"
    }
  };

  // Check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraStatus.textContent = "Your browser doesn't support camera access or you're not using HTTPS";
    console.error("getUserMedia not supported");
    return;
  }

  // For iOS devices, we need special handling
  if (isIOS) {
    video.setAttribute('autoplay', true);
    video.setAttribute('muted', true);
    video.setAttribute('playsinline', true);
    video.style.width = '100%';
    video.style.height = 'auto';
  }

  // Request camera access
  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      video.srcObject = stream;
      
      // iOS Safari requires play to be called from a user interaction
      video.play().catch(e => console.error("Error playing video:", e));
      
      console.log("Camera access granted");
      cameraStatus.textContent = "Camera access granted";
      
      // Show video and hide button after successful camera access
      enableCameraBtn.style.display = "none";
      detectionStatus.classList.remove("hidden");
      
      // Setup face detection after camera is ready
      video.addEventListener("loadedmetadata", setupFaceDetection);
    })
    .catch(err => {
      console.error("Camera access error:", err.name, err.message);
      
      if (err.name === "NotAllowedError") {
        cameraStatus.textContent = "Camera access denied. Please allow camera access and try again.";
      } else if (err.name === "NotFoundError") {
        cameraStatus.textContent = "No camera found. Please connect a camera and try again.";
      } else if (err.name === "NotReadableError") {
        cameraStatus.textContent = "Camera is in use by another application. Please close other camera apps.";
      } else if (err.name === "OverconstrainedError") {
        // Try again with simpler constraints
        cameraStatus.textContent = "Trying simplified camera settings...";
        
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            video.srcObject = stream;
            video.play().catch(e => console.error("Error playing video:", e));
            cameraStatus.textContent = "Camera access granted with basic settings";
            enableCameraBtn.style.display = "none";
            detectionStatus.classList.remove("hidden");
            video.addEventListener("loadedmetadata", setupFaceDetection);
          })
          .catch(e => {
            console.error("Fallback camera access failed:", e);
            cameraStatus.textContent = "Camera access failed. Please check permissions and try again.";
          });
      } else {
        cameraStatus.textContent = "Camera error: " + err.message;
      }
    });
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
