import * as UWAL from "uwal";
import Font from "/PressStart2P.json?url";

const Renderer: UWAL.Renderer = new (await UWAL.Device.Renderer(
    document.getElementById("game") as HTMLCanvasElement
));

/* const { colorAttachments } = */ Renderer.CreatePassDescriptor(
    Renderer.CreateColorAttachment(),
    Renderer.CreateDepthStencilAttachment()
);

const ShapePipeline = new Renderer.Pipeline();
Renderer.SetCanvasSize(innerWidth - 64, innerHeight - 24);

const shapeModule = ShapePipeline.CreateShaderModule(UWAL.Shaders.Shape);
// const { value: Background } = colorAttachments[Symbol.iterator]().next();
// Background.clearValue = new UWAL.Color(0x800000 /* 0x008000 */).rgba;

let P1ScorePipeline: UWAL.RenderPipeline, p1ScoreBuffer: GPUBuffer;
let P2ScorePipeline: UWAL.RenderPipeline, p2ScoreBuffer: GPUBuffer;

let scoreBufferOffset = Float32Array.BYTES_PER_ELEMENT * 6 + 2;
scoreBufferOffset *= Float32Array.BYTES_PER_ELEMENT;

const Perspective = new UWAL.PerspectiveCamera();
const scoreData = Float32Array.from([12, 12]);

const [width, height] = Renderer.CanvasSize;
const Camera = new UWAL.Camera2D(Renderer);

const center = [width / 2, height / 2];
const Scene = new UWAL.Scene();
Scene.AddCamera(Camera);

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

    const translation = new Float32Array(dots);
    const Net = new UWAL.Shape(Geometry);
    Net.SetRenderPipeline(NetPipeline);

    Net.Position = [center[0], center[1] - 15];
    Net.Rotation = Math.PI / 4;
    Scene.Add(Net);

    for (let d = dots; d--; )
        translation.set([d / dots * 2 - 1], d);

    NetPipeline.AddVertexBuffers(buffer);
    NetPipeline.WriteBuffer(buffer, translation);
    Geometry.SetDrawParams(Geometry.Vertices, dots);
    Net.UpdateProjectionMatrix(Camera.ProjectionMatrix);
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

    const Ball = new UWAL.Shape(BallGeometry);
    Ball.SetRenderPipeline(ShapePipeline);

    Ball.Position = center;
    Scene.Add(Ball);
}

/* Players */ {
    const PlayerGeometry = new UWAL.Geometries.Shape({ radius: height / 8 });
    const offset = Renderer.DevicePixelRatio * 64;

    const Player1 = new UWAL.Shape(PlayerGeometry);
    const Player2 = new UWAL.Shape(PlayerGeometry);

    Player1.Position = [      - offset, center[1]];
    Player2.Position = [width + offset, center[1]];

    Player1.SetRenderPipeline(ShapePipeline);
    Player2.SetRenderPipeline(ShapePipeline);

    Player1.Rotation = Math.PI / 4;
    Player2.Rotation = Math.PI / 4;

    Scene.Add(Player1);
    Scene.Add(Player2);
}

/* Score */ {
    const P1Score = new UWAL.MSDFText();
    const P2Score = new UWAL.MSDFText();

    P1ScorePipeline = await P1Score.CreateRenderPipeline(Renderer);
    P2ScorePipeline = await P2Score.CreateRenderPipeline(Renderer);

    p1ScoreBuffer = P1Score.Write("0", await P1Score.LoadFont(Font), 0xffffff);
    p2ScoreBuffer = P2Score.Write("0", await P2Score.LoadFont(Font), 0xffffff);

    const p1Position = UWAL.MathUtils.Mat4.translation([width / -640, 1.6, -4]);
    const p2Position = UWAL.MathUtils.Mat4.translation([width /  832, 1.6, -4]);

    P1Score.SetTransform(p1Position, p1ScoreBuffer);
    P2Score.SetTransform(p2Position, p2ScoreBuffer);

    P1Score.UpdatePerspective(Perspective);
    P2Score.UpdatePerspective(Perspective);

    Renderer.Render(false);
}

function UpdateScore(player: 0 | 1)
{
    if (++scoreData[player] === 22) return GameOver();

    P1ScorePipeline.WriteBuffer(p1ScoreBuffer, scoreData, scoreBufferOffset, 0, 1);
    P2ScorePipeline.WriteBuffer(p2ScoreBuffer, scoreData, scoreBufferOffset, 1, 1);

    Renderer.Render(false);
}

async function GameOver()
{
    scoreData[0] = scoreData[0] = 94;

    const GameOverText = new UWAL.MSDFText();
    await GameOverText.CreateRenderPipeline(Renderer);
    const gameOverPosition = UWAL.MathUtils.Mat4.translation([0, -0.4, -4]);

    const gameOverBuffer = GameOverText.Write(
        "Game Over", await GameOverText.LoadFont(Font), 0xffffff, 0.01, true
    );

    P1ScorePipeline.WriteBuffer(p1ScoreBuffer, scoreData, scoreBufferOffset, 0, 1);
    P2ScorePipeline.WriteBuffer(p2ScoreBuffer, scoreData, scoreBufferOffset, 1, 1);

    GameOverText.SetTransform(gameOverPosition, gameOverBuffer);
    GameOverText.UpdatePerspective(Perspective);

    Renderer.Render();
}

Renderer.Render(Scene);
