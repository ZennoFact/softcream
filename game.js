// ソフトクリームゲーム - Soft Serve Ice Cream Game

class SoftCreamGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Canvas setup
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Game state
        this.isPlaying = false;
        this.isTouching = false;
        this.gameOver = false;
        
        // Camera
        this.video = document.createElement('video');
        this.video.setAttribute('autoplay', '');
        this.video.setAttribute('muted', '');
        this.video.setAttribute('playsinline', '');
        
        // Ice cream segments (physics objects)
        this.iceCreamSegments = [];
        this.segmentRadius = 20;
        this.dropSpeed = 3;
        this.nextSegmentTimer = 0;
        this.segmentInterval = 8; // frames between segments
        
        // Cone position
        this.coneX = 0; // will be set to center
        this.coneY = 0; // will be set to bottom
        this.coneWidth = 80;
        this.coneHeight = 60;
        
        // Tilt data
        this.tiltX = 0; // -1 to 1
        this.tiltZ = 0; // -1 to 1
        this.gravity = 0.3;
        
        // Score
        this.highestPoint = 0;
        this.score = 0;
        
        // Initialize
        this.initCamera();
        this.initSensors();
        this.initControls();
        this.gameLoop();
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.coneX = this.canvas.width / 2;
        this.coneY = this.canvas.height - 30;
    }
    
    async initCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // 背面カメラ
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            this.video.srcObject = stream;
            this.video.play();
        } catch (error) {
            console.error('カメラアクセスエラー:', error);
            // カメラが使えない場合は背景色で代用
        }
    }
    
    initSensors() {
        // 加速度センサーとジャイロセンサー
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (event) => {
                // beta: 前後の傾き (-180 to 180)
                // gamma: 左右の傾き (-90 to 90)
                if (event.beta !== null && event.gamma !== null) {
                    // 縦向き想定
                    this.tiltX = Math.max(-1, Math.min(1, event.gamma / 45)); // -1 to 1
                    this.tiltZ = Math.max(-1, Math.min(1, (event.beta - 90) / 45)); // -1 to 1
                }
            });
        }
        
        // iOS 13+ の場合、権限要求が必要
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            // ユーザーインタラクション後に権限を要求
            this.needsPermission = true;
        }
    }
    
    async requestSensorPermission() {
        if (this.needsPermission) {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    this.needsPermission = false;
                }
            } catch (error) {
                console.error('センサー権限エラー:', error);
            }
        }
    }
    
    initControls() {
        // タッチ開始
        this.canvas.addEventListener('touchstart', async (e) => {
            e.preventDefault();
            this.isTouching = true;
            
            if (!this.isPlaying && !this.gameOver) {
                await this.requestSensorPermission();
                this.startGame();
            } else if (this.gameOver) {
                // ゲームオーバー状態からリスタート
                await this.requestSensorPermission();
                this.startGame();
            }
        });
        
        // タッチ終了
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isTouching = false;
            
            if (this.isPlaying) {
                this.endGame();
            }
        });
        
        // タッチキャンセル
        this.canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.isTouching = false;
            
            if (this.isPlaying) {
                this.endGame();
            }
        });
    }
    
    startGame() {
        this.isPlaying = true;
        this.gameOver = false;
        this.iceCreamSegments = [];
        this.highestPoint = this.coneY;
        this.score = 0;
        this.nextSegmentTimer = 0;
    }
    
    endGame() {
        this.isPlaying = false;
        this.gameOver = true;
    }
    
    update() {
        if (!this.isPlaying) return;
        
        // ソフトクリームを落とす
        if (this.isTouching) {
            this.nextSegmentTimer++;
            if (this.nextSegmentTimer >= this.segmentInterval) {
                this.addIceCreamSegment();
                this.nextSegmentTimer = 0;
            }
        }
        
        // 物理演算
        this.updatePhysics();
        
        // 崩壊チェック
        this.checkCollapse();
        
        // スコア更新
        this.updateScore();
    }
    
    addIceCreamSegment() {
        const segment = {
            x: this.canvas.width / 2,
            y: 50, // 画面上部から
            vx: 0,
            vy: this.dropSpeed,
            radius: this.segmentRadius,
            settled: false
        };
        this.iceCreamSegments.push(segment);
    }
    
    updatePhysics() {
        const tiltForce = this.tiltX * 0.5;
        
        for (let i = 0; i < this.iceCreamSegments.length; i++) {
            const segment = this.iceCreamSegments[i];
            
            if (!segment.settled) {
                // 重力と傾きの影響
                segment.vy += this.gravity;
                segment.vx += tiltForce;
                
                // 空気抵抗
                segment.vx *= 0.98;
                
                // 位置更新
                segment.x += segment.vx;
                segment.y += segment.vy;
                
                // コーンとの衝突判定
                if (this.checkConeCollision(segment)) {
                    segment.settled = true;
                    segment.vy = 0;
                    segment.vx = 0;
                }
                
                // 他のアイスクリームとの衝突判定
                for (let j = 0; j < i; j++) {
                    const other = this.iceCreamSegments[j];
                    if (other.settled && this.checkSegmentCollision(segment, other)) {
                        segment.settled = true;
                        segment.vy = 0;
                        // 横方向の速度を少し残す
                        segment.vx *= 0.5;
                        break;
                    }
                }
                
                // 画面外チェック
                if (segment.x < 0 || segment.x > this.canvas.width ||
                    segment.y > this.canvas.height) {
                    this.endGame();
                }
            } else {
                // 着地したセグメントも傾きの影響を受ける
                segment.vx += tiltForce * 0.3;
                segment.vx *= 0.95;
                segment.x += segment.vx;
                
                // 画面外チェック
                if (segment.x < segment.radius || segment.x > this.canvas.width - segment.radius) {
                    this.endGame();
                }
            }
        }
    }
    
    checkConeCollision(segment) {
        // コーン上部との衝突
        const coneTop = this.coneY - this.coneHeight;
        const distance = Math.abs(segment.y - coneTop);
        const horizontalDist = Math.abs(segment.x - this.coneX);
        
        return distance < segment.radius + 5 && horizontalDist < this.coneWidth / 2;
    }
    
    checkSegmentCollision(segment1, segment2) {
        const dx = segment1.x - segment2.x;
        const dy = segment1.y - segment2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance < (segment1.radius + segment2.radius);
    }
    
    checkCollapse() {
        // アイスクリームが大きく傾いたら崩壊
        for (let i = 1; i < this.iceCreamSegments.length; i++) {
            const segment = this.iceCreamSegments[i];
            const prev = this.iceCreamSegments[i - 1];
            
            if (segment.settled && prev.settled) {
                const dx = Math.abs(segment.x - prev.x);
                if (dx > this.segmentRadius * 1.5) {
                    this.endGame();
                    return;
                }
            }
        }
    }
    
    updateScore() {
        // 最も高い位置を記録
        for (const segment of this.iceCreamSegments) {
            if (segment.settled && segment.y < this.highestPoint) {
                this.highestPoint = segment.y;
                this.score = Math.floor((this.coneY - this.highestPoint) / 10);
            }
        }
    }
    
    render() {
        // カメラ映像を背景に描画
        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            // ビデオを画面全体に描画（縦向き用にトリミング）
            const videoAspect = this.video.videoWidth / this.video.videoHeight;
            const canvasAspect = this.canvas.width / this.canvas.height;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (videoAspect > canvasAspect) {
                drawHeight = this.canvas.height;
                drawWidth = drawHeight * videoAspect;
                drawX = (this.canvas.width - drawWidth) / 2;
                drawY = 0;
            } else {
                drawWidth = this.canvas.width;
                drawHeight = drawWidth / videoAspect;
                drawX = 0;
                drawY = (this.canvas.height - drawHeight) / 2;
            }
            
            this.ctx.drawImage(this.video, drawX, drawY, drawWidth, drawHeight);
        } else {
            // カメラが使えない場合の背景
            this.ctx.fillStyle = '#87CEEB';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // コーンを描画（上部のみ）
        this.drawCone();
        
        // ソフトクリームを描画
        this.drawIceCream();
        
        // UI描画
        this.drawUI();
    }
    
    drawCone() {
        const ctx = this.ctx;
        const x = this.coneX;
        const y = this.coneY;
        const w = this.coneWidth;
        const h = this.coneHeight;
        
        // コーン（上部のみ）
        ctx.fillStyle = '#D2691E';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 3, y - h);
        ctx.lineTo(x - w / 3, y - h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // ワッフル模様
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const yPos = y - (h / 3) * (i + 0.5);
            ctx.beginPath();
            ctx.moveTo(x - w / 2 + (w / 6) * i, yPos);
            ctx.lineTo(x + w / 2 - (w / 6) * i, yPos);
            ctx.stroke();
        }
    }
    
    drawIceCream() {
        const ctx = this.ctx;
        
        for (const segment of this.iceCreamSegments) {
            // 白いソフトクリーム
            ctx.fillStyle = '#FFFAFA';
            ctx.strokeStyle = '#F0E68C';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, segment.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // ハイライト
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(segment.x - 5, segment.y - 5, segment.radius / 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawUI() {
        const ctx = this.ctx;
        
        if (!this.isPlaying && !this.gameOver) {
            // スタート画面
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ソフトクリーム', this.canvas.width / 2, this.canvas.height / 2 - 60);
            
            ctx.font = '20px sans-serif';
            ctx.fillText('画面をタップしている間', this.canvas.width / 2, this.canvas.height / 2);
            ctx.fillText('アイスが落ちてきます', this.canvas.width / 2, this.canvas.height / 2 + 30);
            ctx.fillText('スマホを傾けてバランスを取ろう！', this.canvas.width / 2, this.canvas.height / 2 + 60);
            
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText('タップしてスタート', this.canvas.width / 2, this.canvas.height / 2 + 120);
        } else if (this.gameOver) {
            // ゲームオーバー画面
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ゲーム終了！', this.canvas.width / 2, this.canvas.height / 2 - 40);
            
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText('スコア: ' + this.score, this.canvas.width / 2, this.canvas.height / 2 + 20);
            
            ctx.font = '20px sans-serif';
            ctx.fillText('タップしてリスタート', this.canvas.width / 2, this.canvas.height / 2 + 80);
        } else {
            // ゲーム中のスコア表示
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(10, 10, 150, 60);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('スコア: ' + this.score, 20, 40);
            
            if (this.isTouching) {
                ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            } else {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            }
            ctx.fillRect(20, 50, 130, 10);
        }
    }
    
    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// ゲーム開始
window.addEventListener('load', () => {
    new SoftCreamGame();
});
