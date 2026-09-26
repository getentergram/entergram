class GetEntergram < Formula
  desc "Persistent engineering memory for AI coding agents"
  homepage "https://github.com/getentergram/entergram"
  # Built from the published npm tarball: the package already ships bin/, src/ and the
  # prebuilt viz UI, so there is nothing to compile here beyond the native sqlite dep.
  url "https://registry.npmjs.org/get-entergram/-/get-entergram-0.1.2.tgz"
  sha256 "77c7162b0b5e9f830cecee7312d0627700c34d7c5bd6c6e6d3a9f174876a092f"
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
