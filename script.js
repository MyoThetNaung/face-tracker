const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const context = canvas.getContext("2d");

const ESP32_IP = "http://192.168.x.x"; // Replace with your ESP32 IP

let faceLastSeen = Date.now();
let trackingActive = false;

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/')
]).then(startVideo);

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;
    })
    .catch(err => {
      console.error("Camera access error:", err);
    });
}

video.addEventListener("play", () => {
  canvas.width = video.width;
  canvas.height = video.height;

  setInterval(async () => {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length > 0) {
      const face = detections[0].box;
      const faceCenterX = face.x + face.width / 2;
      const frameWidth = video.width;

      context.beginPath();
      context.arc(faceCenterX, face.y + face.height / 2, 10, 0, 2 * Math.PI);
      context.strokeStyle = "red";
      context.lineWidth = 4;
      context.stroke();

      faceLastSeen = Date.now();

      if (!trackingActive) {
        trackingActive = true;
        console.log("Face acquired.");
      }

      let dir = "center";
      if (faceCenterX < frameWidth / 3) dir = "left";
      else if (faceCenterX > frameWidth * 2 / 3) dir = "right";

      fetch(`${ESP32_IP}/rotate?dir=${dir}`).catch(err => console.warn("ESP32 fetch error:", err));
    } else {
      if (Date.now() - faceLastSeen > 2000 && trackingActive) {
        trackingActive = false;
        console.log("Face lost. Waiting...");
        fetch(`${ESP32_IP}/rotate?dir=center`).catch(err => console.warn("ESP32 fetch error:", err));
      }
    }
  }, 300);
});
