import * as UWAL from "uwal";
import Font from "/PressStart2P.json?url";

const Renderer: UWAL.Renderer = new (await UWAL.Device.Renderer(
    document.getElementById("game") as HTMLCanvasElement
));

/* const { colorAttachments } = */ Renderer.CreatePassDescriptor(
    Renderer.CreateColorAttachment(),
    Renderer.CreateDepthStencilAttachment()
);

// const { value: Background } =
//     colorAttachments[Symbol.iterator]().next();

// Background.clearValue = new UWAL.Color(0x800000 /* 0x008000 */).rgba;

Renderer.SetCanvasSize(innerWidth, innerHeight);
const ShapePipeline = new Renderer.Pipeline();

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
    const module = ShapePipeline.CreateShaderModule(UWAL.Shaders.Shape);
    const BallGeometry = new UWAL.Geometries.Shape({ segments: 32, radius: 16 });

    await Renderer.AddPipeline(ShapePipeline, {
        depthStencil: ShapePipeline.CreateDepthStencilState(void 0, false),
        fragment: ShapePipeline.CreateFragmentState(module),
        vertex: ShapePipeline.CreateVertexState(module,
            BallGeometry.GetPositionBufferLayout(ShapePipeline)
        )
    });

    const Ball = new UWAL.Shape(BallGeometry);
    Ball.SetRenderPipeline(ShapePipeline);

    Ball.Position = center;
    Scene.Add(Ball);
}

/* Players */ {

}

/* Score */ {
    const P1Score = new UWAL.MSDFText();
    const P2Score = new UWAL.MSDFText();

    const Camera = new UWAL.PerspectiveCamera();

    await P1Score.CreateRenderPipeline(Renderer);
    await P2Score.CreateRenderPipeline(Renderer);

    const p1ScoreBuffer = P1Score.Write("0", await P1Score.LoadFont(Font), 0xffffff);
    const p2ScoreBuffer = P2Score.Write("0", await P2Score.LoadFont(Font), 0xffffff);

    const p1position = UWAL.MathUtils.Mat4.translation([width / -640, 1.6, -4]);
    const p2position = UWAL.MathUtils.Mat4.translation([width /  928, 1.6, -4]);

    P1Score.SetTransform(p1position, p1ScoreBuffer);
    P2Score.SetTransform(p2position, p2ScoreBuffer);

    P1Score.UpdatePerspective(Camera);
    P2Score.UpdatePerspective(Camera);

    Renderer.Render(false);
}

Renderer.Render(Scene);
