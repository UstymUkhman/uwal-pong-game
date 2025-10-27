import * as UWAL from "uwal";

const NetShader = /* wgsl */`
@vertex fn textureVertex(
    @location(0) position: vec2f,
    @location(1) translation: f32
) -> @builtin(position) vec4f
{
    let clipSpace = GetVertexClipSpace(position).xy;
    return vec4f(clipSpace + vec2f(0, translation), 0, 1);
}`;

const Renderer: UWAL.Renderer = new (await UWAL.Device.Renderer(
    document.getElementById("game") as HTMLCanvasElement
));

const Camera = new UWAL.Camera2D();
Camera.Size = Renderer.CanvasSize;
const radius = 8, dashes = 8;

const NetPipeline = new Renderer.Pipeline();
Renderer.SetCanvasSize(innerWidth, innerHeight);

const Geometry = new UWAL.Geometries.Shape({ radius });
const module = NetPipeline.CreateShaderModule([UWAL.Shaders.Shape, NetShader]);

const { buffer: translationBuffer, layout: translationLayout } =
    NetPipeline.CreateVertexBuffer("translation", dashes, "instance", "textureVertex");

await Renderer.AddPipeline(NetPipeline, {
    fragment: NetPipeline.CreateFragmentState(module),
    vertex: NetPipeline.CreateVertexState(module, [
        Geometry.GetPositionBufferLayout(NetPipeline), translationLayout
    ], void 0, "textureVertex")
});

const translation = new Float32Array(dashes);
const Net = new UWAL.Shape(Geometry);
Net.SetRenderPipeline(NetPipeline);

Net.Position = [150, 65];
Net.Scaling  = [0.5, 1.0];
Net.Rotation = Math.PI / 4;

for (let d = dashes; d--; )
    translation.set([d / dashes * 2 - 1], d);

NetPipeline.AddVertexBuffers(translationBuffer);
Net.UpdateProjectionMatrix(Camera.ProjectionMatrix);
NetPipeline.SetDrawParams(Geometry.Vertices, dashes);
NetPipeline.WriteBuffer(translationBuffer, translation);

// setTimeout(() => {
//     const { colorAttachments } = Renderer.RenderPassDescriptor;
//     const { value } = colorAttachments[Symbol.iterator]().next();
//     value.clearValue = new UWAL.Color(0x800000 /* 0x008000 */).rgba;
//     Renderer.Render();
// }, 1e3);

Renderer.Render();
