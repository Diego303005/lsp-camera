// =================================================================================================
// 1. DECLARACIONES INICIALES (Variables y referencias a elementos HTML)
//    Estas deben estar al principio del script para que todas las funciones puedan acceder a ellas.
// =================================================================================================
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
// Las siguientes referencias pueden causar un error si los elementos ya no existen en index.html
// Por eso, las hacemos condicionales o las retiramos si no se usan.
const exportButton = document.getElementById('export'); // Ya no existe en HTML
const vectorOutput = document.getElementById('vector');   // Ya no existe en HTML

const recognizedGestureDisplay = document.getElementById('recognizedGesture'); // Referencia al div donde mostraremos la seña

let savedGestures = {}; // Este objeto almacenará todas las señas cargadas desde Abecedario.json

// =================================================================================================
// 2. CONFIGURACIÓN DE MEDIAPIPE HANDS
// =================================================================================================
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 1, // Limitamos la detección a una sola mano para simplificar el gestor de señas
    modelComplexity: 1,
    minDetectionConfidence: 0.7, // Confianza mínima para detectar una mano
    minTrackingConfidence: 0.7   // Confianza mínima para seguir la mano
});

// =================================================================================================
// 3. FUNCIONES AUXILIARES (Carga de gestos, Normalización, Distancia Euclidiana, Reconocimiento)
//    Estas funciones deben estar definidas ANTES de ser usadas por onResults o al inicio del script.
// =================================================================================================

// Función para cargar los datos de las señas desde el archivo JSON
async function loadGestures() {
    try {
        const response = await fetch('Abecedario.json'); // Solicita el archivo Abecedario.json
        const data = await response.json(); // Parsea el contenido del archivo como JSON
        savedGestures = data; // Almacena los datos de las señas en nuestra variable global
        console.log("Gestos cargados exitosamente:", savedGestures); // Mensaje en la consola del navegador
    } catch (error) {
        console.error("Error al cargar los gestos:", error);
        recognizedGestureDisplay.textContent = "Error: No se pudieron cargar las señas. ¡Asegúrate de que 'Abecedario.json' exista y sea un JSON válido!";
    }
}

// Función para normalizar los 21 puntos (landmarks) de la mano.
// Recibe un array de objetos {x,y,z} y devuelve un array de arrays [x,y,z] normalizados
function normalizeLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) {
        return null;
    }

    const basePoint = landmarks[0];
    const normalized = landmarks.map(p => [
        p.x - basePoint.x,
        p.y - basePoint.y,
        p.z - basePoint.z
    ]);

    const middleFingerTip = normalized[12];
    const wrist = normalized[0];

    const scaleFactor = Math.sqrt(
        (middleFingerTip[0] - wrist[0]) ** 2 +
        (middleFingerTip[1] - wrist[1]) ** 2 +
        (middleFingerTip[2] - wrist[2]) ** 2
    );

    if (scaleFactor === 0 || isNaN(scaleFactor)) {
        return null;
    }

    return normalized.map(p => [
        p[0] / scaleFactor,
        p[1] / scaleFactor,
        p[2] / scaleFactor
    ]);
}

// Función para calcular la distancia euclidiana entre dos conjuntos de landmarks normalizados.
// Recibe dos arrays de arrays [[x,y,z], ...]
function getEuclideanDistance(landmarks1, landmarks2) {
    if (!landmarks1 || !landmarks2 || landmarks1.length !== landmarks2.length || landmarks1.length !== 21) {
        return Infinity;
    }

    let sumSq = 0;
    for (let i = 0; i < landmarks1.length; i++) {
        for (let j = 0; j < 3; j++) {
            sumSq += (landmarks1[i][j] - landmarks2[i][j]) ** 2;
        }
    }
    return Math.sqrt(sumSq);
}

// Función principal para reconocer la seña de la mano actual.
function recognizeGesture(currentHandLandmarks) {
    if (!currentHandLandmarks) return "Ninguna seña detectada";

    const normalizedCurrent = normalizeLandmarks(currentHandLandmarks);
    if (!normalizedCurrent) return "Normalización fallida";

    let closestGesture = "Desconocido";
    let minDistance = Infinity;

    const distanceThreshold = 0.5; // Ajusta este valor según tus pruebas

    for (const gestureName in savedGestures) {
        const gestureVariations = savedGestures[gestureName];

        for (const variation of gestureVariations) {
            const normalizedVariation = normalizeLandmarks(
                variation.map(arr => ({ x: parseFloat(arr[0]), y: parseFloat(arr[1]), z: parseFloat(arr[2]) }))
            );

            if (normalizedVariation) {
                const distance = getEuclideanDistance(normalizedCurrent, normalizedVariation);

                if (distance < minDistance) {
                    minDistance = distance;
                    closestGesture = gestureName;
                }
            }
        }
    }

    if (minDistance < distanceThreshold) {
        return closestGesture;
    } else {
        return "Desconocido";
    }
}

// =================================================================================================
// 4. FUNCIÓN ONRESULTS (Maneja los resultados de la detección de manos de MediaPipe)
//    Esta función se llama cada vez que MediaPipe procesa un frame de la cámara.
// =================================================================================================
hands.onResults(onResults);

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height
    );

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const currentHandLandmarks = results.multiHandLandmarks[0];

        // Dibuja las conexiones y puntos en el canvas con colores verdes
        drawConnectors(canvasCtx, currentHandLandmarks, Hands.HAND_CONNECTIONS, {
            color: '#00FF00', // Verde para los lazos
            lineWidth: 5
        });
        drawLandmarks(canvasCtx, currentHandLandmarks, {
            color: '#00FF00', // Verde para los puntos
            lineWidth: 3
        });

        const recognized = recognizeGesture(currentHandLandmarks);
        recognizedGestureDisplay.textContent = `Seña detectada: ${recognized}`;

    } else {
        recognizedGestureDisplay.textContent = "Seña detectada: Ninguna";
    }
    canvasCtx.restore();
}

// =================================================================================================
// 5. CONFIGURACIÓN Y ARRANQUE DE LA CÁMARA
//    Esto inicializa la cámara web y la conecta con MediaPipe.
// =================================================================================================
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({
            image: videoElement
        });
    },
    width: 400,
    height: 300
});
camera.start();

// =================================================================================================
// 6. LLAMADAS INICIALES Y EVENT LISTENERS
// =================================================================================================
loadGestures();

// Listener del botón de exportar (solo si el elemento existe en el HTML)
if (exportButton) { 
    exportButton.addEventListener('click', () => {
        console.log("Botón 'Exportar Vector' clickeado. La lógica de exportación activa ha sido removida de la vista.");
    });
}