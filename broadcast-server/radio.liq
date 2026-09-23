# Hot Live 95 — 24/7 playout: AutoDJ music library + live DJ takeover -> Icecast
# Liquidsoap 2.2.x

# ---- Settings from environment ----
icecast_host = environment.get("ICECAST_HOST")
icecast_port = int_of_string(environment.get("ICECAST_PORT"))
icecast_pw   = environment.get("ICECAST_SOURCE_PASSWORD")
harbor_pw    = environment.get("HARBOR_PASSWORD")
djs_env      = environment.get("DJS")
mount        = environment.get("MOUNT")
bitrate      = int_of_string(environment.get("BITRATE"))

# ---- AutoDJ: endlessly shuffle everything in /music ----
autodj = playlist(mode="randomize", reload_mode="watch", "/music")
autodj = mksafe(autodj)

# ---- Live DJ auth: accept the shared password OR any user:pass in DJS ----
def dj_auth(user, password) =
  ok = ref(password == harbor_pw)
  if djs_env != "" then
    list.iter(
      fun (pair) ->
        begin
          parts = string.split(separator=":", pair)
          if list.length(parts) >= 2 then
            if list.nth(default="", parts, 0) == user
               and list.nth(default="", parts, 1) == password then
              ok := true
            end
          end
        end,
      string.split(separator=",", djs_env)
    )
  end
  !ok
end

# DJ Playout Studio connects here (Icecast mode): port 8005, mount /live
live = input.harbor("/live", port=8005, auth=dj_auth, buffer=2.0, max=10.0)

# Live DJ wins when connected; otherwise AutoDJ. Never goes silent.
radio = fallback(track_sensitive=false, [live, autodj])
radio = crossfade(fade_out=2.0, fade_in=2.0, radio)
radio = mksafe(radio)

# ---- Publish the final mix to Icecast for listeners ----
output.icecast(
  %mp3(bitrate=bitrate),
  host=icecast_host,
  port=icecast_port,
  password=icecast_pw,
  mount=mount,
  name="Hot Live 95",
  genre="Various",
  description="Hot Live 95 Detroit - A.I. Radio",
  radio
)
