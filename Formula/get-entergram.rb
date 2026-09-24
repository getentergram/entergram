class GetEntergram < Formula
  desc "Persistent engineering memory for AI coding agents"
  homepage "https://github.com/getentergram/entergram"
  # Built from the published npm tarball: the package already ships bin/, src/ and the
  # prebuilt viz UI, so there is nothing to compile here beyond the native sqlite dep.
  url "https://registry.npmjs.org/get-entergram/-/get-entergram-0.1.1.tgz"
  sha256 "e3d6f4e70afc5f35ecf9b0d9c6d145cff6248922c86ef9a361577bf5e6e84491"
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
