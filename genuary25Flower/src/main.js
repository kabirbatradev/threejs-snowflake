import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 0); // Position above
camera.lookAt(0, 0, 0);

// Renderer setup
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Bloom setup
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.4,    // strength
    0.4,    // radius
    0.85    // threshold
);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2; // Limit to not go below horizontal

// Reference helpers
const gridHelper = new THREE.GridHelper(10, 10);
gridHelper.material.opacity = 0.5;
gridHelper.material.transparent = true;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

class DLASnowflake {
    constructor() {
        this.particleRadius = 0.08;  // NEW: explicit radius variable
        this.randomness = 0.9; // Adjust this value to control random movement
        this.particleGeometry = new THREE.SphereGeometry(this.particleRadius, 8, 8);
        this.particleMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
        });

        this.maxParticles = 5000;
        this.instancedMesh = new THREE.InstancedMesh(
            this.particleGeometry,
            this.particleMaterial,
            this.maxParticles
        );
        scene.add(this.instancedMesh);

        this.particleCount = 0;
        this.structure = [];

        // Add seed particle at center
        this.addParticle(new THREE.Vector3(0, 0, 0));

        // NEW: Add properties for active particles
        this.activeParticles = [];  // Array to track moving particles
        this.spawnRadius = 10;       // Distance from center to spawn
        this.stepSize = 0.02;       // How far particles move each step
        this.maxActive = 50;        // Maximum number of active particles
    }


    generateXYZSymmetry(position) {
        const positions = [];
        // Original position
        positions.push(position.clone());

        // Mirror across XY, YZ, and XZ planes
        positions.push(new THREE.Vector3(-position.x, position.y, position.z));
        positions.push(new THREE.Vector3(position.x, -position.y, position.z));
        positions.push(new THREE.Vector3(position.x, position.y, -position.z));
        positions.push(new THREE.Vector3(-position.x, -position.y, position.z));
        positions.push(new THREE.Vector3(-position.x, position.y, -position.z));
        positions.push(new THREE.Vector3(position.x, -position.y, -position.z));
        positions.push(new THREE.Vector3(-position.x, -position.y, -position.z));

        return positions;
    }

    generateSpiralSymmetry(position) {
        const positions = [];
        const numRotations = 6; // 6-fold symmetry
        
        // Create rotational symmetry around Y axis
        for (let i = 0; i < numRotations; i++) {
            const angle = (Math.PI * 2 * i) / numRotations;
            
            // Rotate position around Y axis
            const rotated = new THREE.Vector3(
                position.x * Math.cos(angle) - position.z * Math.sin(angle),
                position.y,
                position.x * Math.sin(angle) + position.z * Math.cos(angle)
            );
            
            // Add rotated position
            positions.push(rotated);
            
            // Add reflection across XZ plane (y becomes -y)
            positions.push(new THREE.Vector3(
                rotated.x,
                -rotated.y,
                rotated.z
            ));
        }
        
        return positions;
    }

    generateSymmetry(position) {
        const positions = [];
    
        // Base rotations (60° increments)
        const numRotations = 6;
        for (let i = 0; i < numRotations; i++) {
            const angle = (Math.PI * 2 * i) / numRotations;
            
            // Rotate position around Y axis
            const rotated = new THREE.Vector3(
                position.x * Math.cos(angle) - position.z * Math.sin(angle),
                position.y,
                position.x * Math.sin(angle) + position.z * Math.cos(angle)
            );
            
            // For each rotated position, reflect across XY plane
            positions.push(
                rotated.clone(),                    // Original
                new THREE.Vector3(
                    rotated.x,
                    rotated.y,
                    -rotated.z                      // Reflect across XY plane
                )
            );
    
            // Also reflect across XZ plane
            positions.push(
                new THREE.Vector3(
                    rotated.x,
                    -rotated.y,
                    rotated.z                       // Reflect across XZ plane
                ),
                new THREE.Vector3(
                    rotated.x,
                    -rotated.y,
                    -rotated.z                      // Reflect across both planes
                )
            );
        }
        
        return positions;
    }
    

    // Modify addParticle to use symmetry
    addParticle(position) {
        const symmetricalPositions = this.generateSymmetry(position);

        for (const pos of symmetricalPositions) {
            if (this.particleCount >= this.maxParticles) return;

            const matrix = new THREE.Matrix4();
            matrix.setPosition(pos);

            this.instancedMesh.setMatrixAt(this.particleCount, matrix);
            this.structure.push(pos);
            this.particleCount++;
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    // NEW: Spawn a particle on the sphere surface
    spawnParticle() {
        // Random point on sphere surface using spherical coordinates
        const phi = Math.random() * Math.PI * 2;
        const cosTheta = Math.random() * 2 - 1;
        const theta = Math.acos(cosTheta);

        const x = this.spawnRadius * Math.sin(theta) * Math.cos(phi);
        const y = this.spawnRadius * Math.sin(theta) * Math.sin(phi);
        const z = this.spawnRadius * Math.cos(theta);

        return new THREE.Vector3(x, y, z);
    }

    // NEW: Move active particles
    moveParticles() {
        // Spawn new particles if needed
        while (this.activeParticles.length < this.maxActive) {
            this.activeParticles.push(this.spawnParticle());
        }

        // Move each active particle
        for (let i = this.activeParticles.length - 1; i >= 0; i--) {
            const particle = this.activeParticles[i];

            // Move towards center with some randomness
            const toCenter = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), particle).normalize();
            const randomOffset = new THREE.Vector3(
                (Math.random() - 0.5) * this.randomness,
                (Math.random() - 0.5) * this.randomness,
                (Math.random() - 0.5) * this.randomness
            );

            particle.add(toCenter.multiplyScalar(this.stepSize)).add(randomOffset);

            // Check for collisions with structure
            if (this.checkCollision(particle)) {
                this.addParticle(particle);
                this.activeParticles.splice(i, 1);
            }
        }

        this.updateActiveParticles();
    }

    checkCollision(particle) {
        const collisionDistance = this.particleRadius * 4;
        return this.structure.some(fixed =>
            particle.distanceTo(fixed) < collisionDistance
        );
    }

    // NEW: Update visualization of active particles
    updateActiveParticles() {
        // Update all instances
        for (let i = 0; i < this.maxParticles; i++) {
            const matrix = new THREE.Matrix4();

            if (i < this.structure.length) {
                matrix.setPosition(this.structure[i]);
            } else if (i < this.structure.length + this.activeParticles.length) {
                matrix.setPosition(this.activeParticles[i - this.structure.length]);
            } else {
                matrix.setPosition(new THREE.Vector3(999, 999, 999)); // Hide unused instances
            }

            this.instancedMesh.setMatrixAt(i, matrix);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
}

const snowflake = new DLASnowflake();

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    snowflake.moveParticles(); // Add this line
    controls.update();
    composer.render(); // Use composer instead of renderer
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);
});
