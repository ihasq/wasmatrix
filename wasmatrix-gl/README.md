# @wasmatrix/gl

glMatrix-compatible wrappers in the WASMatrix package family.

The package keeps glMatrix's mutable `out` API and column-major matrix layout.
Its fixed 2x2 through 4x4 operations use allocation-light direct kernels; this
avoids row-major conversion and WebAssembly boundary overhead for tiny inputs.
