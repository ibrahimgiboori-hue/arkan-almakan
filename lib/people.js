export function personTitle(person) {
  if (!person) return '';

  const position = (person.board_role || '').trim();
  const jobTitle = (person.job_title || '').trim();

  if (person.person_kind === 'board') {
    return [position, jobTitle].filter(Boolean).join(' و');
  }

  return jobTitle;
}

export function personLabel(person) {
  if (!person) return '';
  const title = personTitle(person);
  return `${person.full_name_ar || ''}${title ? ` - ${title}` : ''}`.trim();
}
