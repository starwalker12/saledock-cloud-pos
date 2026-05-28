-- Migration 0027: Increase storage bucket upload limits to 5 MB

update storage.buckets
set file_size_limit = 5242880
where id in ('profile-pictures', 'public-branding')
  and file_size_limit < 5242880;
