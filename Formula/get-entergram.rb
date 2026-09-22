class GetEntergram < Formula
  desc "Persistent engineering memory for AI coding agents"
  homepage "https://github.com/chandrasaripaka/entergram"
  # Built from the published npm tarball: the package already ships bin/, src/ and the
  # prebuilt viz UI, so there is nothing to compile here beyond the native sqlite dep.
  url "https://registry.npmjs.org/get-entergram/-/get-entergram-0.1.0.tgz"
  # PLACEHOLDER — all zeros until the package is published. Fill it with:
  #   curl -sL "$(npm view get-entergram dist.tarball)" | shasum -a 256
  # Kept in valid 64-char form so `brew style` passes; an install against it fails
  # loudly with a checksum mismatch rather than a parse error.
  sha256 "d04a6817095fbbd97ed807444a0dea08a43f1e8acacab61e94e9e932cc90fefc"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # `init` writes a store into the sandboxed test dir; doctor must then agree with it.
    system bin/"entergram", "init"
    assert_match "consistent", shell_output("#{bin}/entergram doctor")
  end
end
