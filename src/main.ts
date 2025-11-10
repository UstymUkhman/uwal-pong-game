import * as UWAL from "uwal";
import Font from "/PressStart2P.json?url";

const background = new UWAL.Color();
let p1ScoreBuffer: GPUBuffer, p2ScoreBuffer: GPUBuffer;
let PlayerScore: UWAL.MSDFText, ScorePipeline: UWAL.RenderPipeline;

const game = document.getElementById("game") as HTMLCanvasElement;
const Renderer: UWAL.Renderer = new (await UWAL.Device.Renderer(game));

const { colorAttachments } = Renderer.CreatePassDescriptor(
    Renderer.CreateColorAttachment(background),
    Renderer.CreateDepthStencilAttachment()
);

Renderer.SetCanvasSize(innerWidth - 64, innerHeight - 24);
const ShapePipeline = new Renderer.Pipeline();

const shapeModule = ShapePipeline.CreateShaderModule(UWAL.Shaders.Shape);
const { value: Background } = colorAttachments[Symbol.iterator]().next();

let scoreBufferOffset = Float32Array.BYTES_PER_ELEMENT * 6 + 2;
scoreBufferOffset *= Float32Array.BYTES_PER_ELEMENT;

const Material = new UWAL.Materials.Color(0xffffff);
const Perspective = new UWAL.PerspectiveCamera();
const scoreData = Float32Array.from([12, 12]);
let Player1: UWAL.Shape, Player2: UWAL.Shape;

const [width, height] = Renderer.CanvasSize;
const Camera = new UWAL.Camera2D(Renderer);
const center = [width / 2, height / 2];
let Ball: UWAL.Shape, Net: UWAL.Shape;

const Scene = new UWAL.Scene();
const ballDirection = [0, 0];
const playerOffset = [0, 0];

Scene.AddCamera(Camera);
const playerSpeed = 16;
const bounds = [0, 0];
let gameOver = false;

let direction = 0;
let ballSpeed = 4;
let raf: number;
let delay = 60;

/* Net */ {
    const dots = 32,
    NetShader = /* wgsl */`
    @vertex fn textureVertex(
        @location(0) position: vec2f,
        @location(1) translation: f32
    ) -> @builtin(position) vec4f
    {
        let clipSpace = GetVertexClipSpace(position).xy;
        return vec4f(clipSpace + vec2f(0, translation), 0, 1);
    }`;

    const translation = new Float32Array(dots);
    const NetPipeline = new Renderer.Pipeline();

    const Geometry = new UWAL.Geometries.Shape({ radius: 8 });
    const module = NetPipeline.CreateShaderModule([UWAL.Shaders.Shape, NetShader]);

    const { buffer, layout } = NetPipeline.CreateVertexBuffer(
        "translation", dots, "instance", "textureVertex"
    );

    await Renderer.AddPipeline(NetPipeline, {
        depthStencil: ShapePipeline.CreateDepthStencilState(void 0, false),
        fragment: NetPipeline.CreateFragmentState(module),
        vertex: NetPipeline.CreateVertexState(module, [
            Geometry.GetPositionBufferLayout(NetPipeline), layout
        ], void 0, "textureVertex")
    });

    Net = new UWAL.Shape(Geometry, Material);
    Net.SetRenderPipeline(NetPipeline);

    Net.Rotation = Math.PI / 4;
    Scene.Add(Net);

    for (let d = dots; d--; )
        translation.set([d / dots * 2 - 1], d);

    NetPipeline.AddVertexBuffers(buffer);
    NetPipeline.WriteBuffer(buffer, translation);
    Geometry.SetDrawParams(Geometry.Vertices, dots);
}

/* Ball */ {
    const BallGeometry = new UWAL.Geometries.Shape({ segments: 32, radius: 16 });

    await Renderer.AddPipeline(ShapePipeline, {
        depthStencil: ShapePipeline.CreateDepthStencilState(void 0, false),
        fragment: ShapePipeline.CreateFragmentState(shapeModule),
        vertex: ShapePipeline.CreateVertexState(shapeModule,
            BallGeometry.GetPositionBufferLayout(ShapePipeline)
        )
    });

    Ball = new UWAL.Shape(BallGeometry, Material);
    Ball.SetRenderPipeline(ShapePipeline);

    Scene.Add(Ball);
}

/* Score */ {
    PlayerScore = new UWAL.MSDFText();
    ScorePipeline = await PlayerScore.CreateRenderPipeline(Renderer);
    await PlayerScore.LoadFont(Font);

    p1ScoreBuffer = PlayerScore.Write("0", 0xffffff);
    p2ScoreBuffer = PlayerScore.Write("0", 0xffffff);
}

function Render()
{
    let [dx, dy] = ballDirection;
    const { min, max } = Ball.BoundingBox;
    const [width, height] = Renderer.CanvasSize;

    let y = (Math.sign(dx) + 1 && Player2 || Player1).Position[1];
    const p1 = (y - bounds[0] <= max[1]) && (min[1] <= y + bounds[0])
        && bounds[0] - playerOffset[0] || 0;

    y = Player1.Position[1] + direction * playerSpeed;
    Player1.Position[1] = UWAL.MathUtils.Clamp(y, ...bounds);

    if (min[0] <= p1 || max[0] >= (width - p1))
    {
        if (!p1)
        {
            UpdateScore((Math.sign(dx) + 1) / -2 + 1 as 0 | 1);
            Player2.Position[1] = center[1];
            
            Ball.Position[0] = center[0];
            Ball.Position[1] = center[1];

            Renderer.Render(false);
            Renderer.Render(Scene);

            return ResetBall();
        }
        else
        {
            ballSpeed = Math.min(ballSpeed + 2, 32);
            dx *= -1;
        }
    }

    if (min[1] <= 0 || max[1] >= height) dy *= -1;

    if (0 < delay && !--delay)
    {
        playerOffset[1] = Player2.Position[1] - Ball.Position[1];

        setTimeout(() =>
            delay = UWAL.MathUtils.RandomInt(4, ballSpeed),
            UWAL.MathUtils.RandomInt(16384, 32768)
        );
    }
    else if (!delay)
        Player2.Position[1] = UWAL.MathUtils.Clamp(
            Ball.Position[1] + playerOffset[1], ...bounds
        );

    Ball.Position[0] += dx * ballSpeed;
    Ball.Position[1] += dy * ballSpeed;

    ballDirection[0] = dx;
    ballDirection[1] = dy;

    Renderer.Render(false);
    Renderer.Render(Scene);

    raf = requestAnimationFrame(Render);
}

function OnResize()
{
    if (gameOver) return location.reload();

    Renderer.SetCanvasSize(innerWidth - 64, innerHeight - 24);
    const [newWidth, newHeight] = Renderer.CanvasSize;
    Perspective.AspectRatio = Renderer.AspectRatio;

    Perspective.UpdateViewProjectionMatrix();
    Camera.Size = Renderer.CanvasSize;

    center[0] = newWidth / 2;
    center[1] = newHeight / 2;

    const h8  = newHeight / 8;
    const h16 = newHeight / 16;
    const h64 = newHeight / 64;

    Ball.Position = center;
    Net.Position = [center[0], center[1] - h64];

    /* Players */ {
        const radius = h8;
        playerOffset[0] = h16;

        if (Player1 && Player2)
        {
            Scene.Remove([Player1, Player2]);
            Player1.Destroy(); Player2.Destroy();
        }

        bounds[1] = newHeight - (bounds[0] = radius / Math.sqrt(2));
        const PlayerGeometry = new UWAL.Geometries.Shape({ radius });

        Player1 = new UWAL.Shape(PlayerGeometry, Material);
        Player2 = new UWAL.Shape(PlayerGeometry, Material);

        Player1.SetRenderPipeline(ShapePipeline);
        Player2.SetRenderPipeline(ShapePipeline);

        Player1.Position = [         - h16, center[1]];
        Player2.Position = [newWidth + h16, center[1]];

        Player1.Rotation = Math.PI / 4;
        Player2.Rotation = Math.PI / 4;

        Scene.Add(Player1);
        Scene.Add(Player2);
    }

    /* Score */ {
        const p1Position = UWAL.MathUtils.Mat4.translation([newWidth / -696, 1.6, -4]);
        const p2Position = UWAL.MathUtils.Mat4.translation([newWidth /  960, 1.6, -4]);

        PlayerScore.SetTransform(p1Position, p1ScoreBuffer);
        PlayerScore.SetTransform(p2Position, p2ScoreBuffer);

        PlayerScore.UpdatePerspective(Perspective);
    }

    Renderer.Render(false);
    Renderer.Render(Scene);
}

function ResetBall()
{
    let x = UWAL.MathUtils.RandomInt(0, 1) * 2 - 1;
    let y = UWAL.MathUtils.RandomInt(0, 1) * 2 - 1;

    ballDirection[0] = x * UWAL.MathUtils.Random(0.5);
    ballDirection[1] = y * UWAL.MathUtils.Random(0.5);

    ballSpeed = delay = 4;
    playerOffset[1] = 0;
}

function UpdateScore(player: 0 | 1)
{
    if (++scoreData[player] === 22) return GameOver(scoreData[0] === 22);
    const buffer = player && p2ScoreBuffer || p1ScoreBuffer;
    ScorePipeline.WriteBuffer(buffer, scoreData, scoreBufferOffset, player, 1);
}

async function GameOver(win?: boolean)
{
    scoreData[0] = scoreData[1] = 94;
    const result = win && 'win' || 'lose';

    const GameOverText = new UWAL.MSDFText();
    await GameOverText.CreateRenderPipeline(Renderer);
    await GameOverText.LoadFont(Font);

    const gameOverBuffer = GameOverText.Write(`Game Over\nYou ${result}!`, 0xffffff, 0.01, true);

    ScorePipeline.WriteBuffer(p1ScoreBuffer, scoreData, scoreBufferOffset, 0, 1);
    ScorePipeline.WriteBuffer(p2ScoreBuffer, scoreData, scoreBufferOffset, 1, 1);

    Background!.clearValue = background.Set(win && 0x008000 || 0x800000).rgba;
    const gameOverPosition = UWAL.MathUtils.Mat4.translation([0, -0.4, -4]);

    GameOverText.SetTransform(gameOverPosition, gameOverBuffer);
    GameOverText.UpdatePerspective(Perspective);

    ShapePipeline.Active = Ball.Visible =
    Player1.Visible = Player2.Visible = false;

    game.classList.add(result);
    cancelAnimationFrame(raf);

    Renderer.Render(false);
    Renderer.Render(Scene);

    gameOver = true;
}

function OnKeyDown(event: KeyboardEvent)
{
    switch (event.code)
    {
        case "Space":
            if (gameOver)
                return location.reload();

            if (Ball.Position[0] === center[0] &&
                Ball.Position[1] === center[1])
            {
                ResetBall();
                Render();
            }
        break;

        case "ArrowUp":
            direction = -1;
        break;

        case "ArrowDown":
            direction = 1;
        break;
    }
}

addEventListener("keydown", OnKeyDown, false);
addEventListener("keyup", () => direction = 0, false);
addEventListener("resize", OnResize, false); OnResize();
