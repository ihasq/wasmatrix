# @wasmatrix/gpu

wgpu-matrix-compatible wrappers backed by WASMatrix operation templates.

The package follows wgpu-matrix's optional destination-last convention:

```ts
import { mat4, vec3 } from "@wasmatrix/gpu";

const model = mat4.translate(mat4.identity(), [1, 2, 3]);
const position = vec3.transformMat4([4, 5, 6], model);
```

`mat3` values are represented as 12-float WebGPU matrices, with each column
padded to 4 floats. Matrix multiply and vector transform paths delegate through
WASMatrix so the package stays a thin compatibility layer rather than a separate
math core.
